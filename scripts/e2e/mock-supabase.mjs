// =====================================================================
// 動作確認（E2Eテスト）専用：Supabase の「ログイン」と「データAPI」のうち、
// このアプリが使う部分だけをまねる小さなサーバー。本番では使いません。
//
// ・データは本物の PostgreSQL に保存し、安全ルール（RLS）も本物どおりに効かせる
//   （ログイン中の利用者として SET ROLE authenticated / request.jwt.claims を設定して実行）
// ・ログインのしくみ（GoTrue）は、メール＋パスワードの最低限だけ
// =====================================================================

import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import http from "node:http";

const IDENT = /^[a-z_][a-z0-9_]*$/;
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "or"]);

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function createMockSupabase({ pool, jwtSecret, publishableKey, secretKey }) {
  const columnTypes = new Map();

  // ------------------------------------------------------------------
  // JWT（ログイン中の印）
  // ------------------------------------------------------------------
  function signJwt(payload) {
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify(payload));
    const sig = createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest("base64url");
    return `${header}.${body}.${sig}`;
  }

  function verifyJwt(token) {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const expected = createHmac("sha256", jwtSecret).update(`${parts[0]}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  }

  // ------------------------------------------------------------------
  // ログイン（GoTrue のまね）
  // ------------------------------------------------------------------
  async function setupAuthTables() {
    await pool.query(`
      create table if not exists auth.mock_passwords (user_id uuid primary key, hash text not null);
      create table if not exists auth.mock_refresh (token text primary key, user_id uuid not null);
    `);
  }

  function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
  }

  function checkPassword(password, stored) {
    const [salt, hash] = stored.split(":");
    return timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(password, salt, 32));
  }

  function userJson(row) {
    return {
      id: row.id,
      aud: "authenticated",
      role: "authenticated",
      email: row.email,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: row.raw_user_meta_data ?? {},
      identities: [{ id: row.id, user_id: row.id, provider: "email", identity_data: { email: row.email } }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async function issueSession(row) {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = signJwt({
      sub: row.id,
      email: row.email,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: now + 3600,
      session_id: randomUUID(),
    });
    const refreshToken = randomBytes(24).toString("hex");
    await pool.query("insert into auth.mock_refresh (token, user_id) values ($1, $2)", [refreshToken, row.id]);
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: refreshToken,
      user: userJson(row),
    };
  }

  /** 管理画面の「Add user」と同じ：確認済みのユーザーを作る */
  async function createUser(email, password, metadata = {}) {
    const { rows } = await pool.query(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id, email, raw_user_meta_data",
      [email, metadata],
    );
    await pool.query("insert into auth.mock_passwords (user_id, hash) values ($1, $2)", [rows[0].id, hashPassword(password)]);
    return rows[0];
  }

  async function handleAuth(req, res, path, body) {
    const authError = (status, code, msg) => send(res, status, { code: status, error_code: code, msg });

    if (path === "/auth/v1/signup" && req.method === "POST") {
      const { email, password, data } = body;
      const exists = await pool.query("select 1 from auth.users where email = $1", [email]);
      if (exists.rowCount) return authError(422, "user_already_exists", "User already registered");
      if (!password || password.length < 6) return authError(422, "weak_password", "Password should be at least 6 characters");
      const row = await createUser(email, password, data ?? {});
      return send(res, 200, await issueSession(row));
    }

    if (path === "/auth/v1/token" && req.method === "POST") {
      const grant = new URL(req.url, "http://x").searchParams.get("grant_type");
      if (grant === "password") {
        const { rows } = await pool.query(
          "select u.id, u.email, u.raw_user_meta_data, p.hash from auth.users u join auth.mock_passwords p on p.user_id = u.id where u.email = $1",
          [body.email],
        );
        if (!rows[0] || !checkPassword(body.password ?? "", rows[0].hash)) {
          return authError(400, "invalid_credentials", "Invalid login credentials");
        }
        return send(res, 200, await issueSession(rows[0]));
      }
      if (grant === "refresh_token") {
        const { rows } = await pool.query(
          "delete from auth.mock_refresh r using auth.users u where r.token = $1 and u.id = r.user_id returning u.id, u.email, u.raw_user_meta_data",
          [body.refresh_token],
        );
        if (!rows[0]) return authError(400, "refresh_token_not_found", "Invalid Refresh Token");
        return send(res, 200, await issueSession(rows[0]));
      }
      return authError(400, "unsupported_grant_type", "unsupported");
    }

    if (path === "/auth/v1/user" && req.method === "GET") {
      const claims = verifyJwt((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!claims) return authError(401, "bad_jwt", "invalid JWT");
      const { rows } = await pool.query("select id, email, raw_user_meta_data from auth.users where id = $1", [claims.sub]);
      if (!rows[0]) return authError(404, "user_not_found", "User not found");
      return send(res, 200, userJson(rows[0]));
    }

    if (path === "/auth/v1/user" && req.method === "PUT") {
      const claims = verifyJwt((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!claims) return authError(401, "bad_jwt", "invalid JWT");
      if (body.password) {
        await pool.query("update auth.mock_passwords set hash = $2 where user_id = $1", [claims.sub, hashPassword(body.password)]);
      }
      const { rows } = await pool.query("select id, email, raw_user_meta_data from auth.users where id = $1", [claims.sub]);
      return send(res, 200, userJson(rows[0]));
    }

    if (path === "/auth/v1/logout") return send(res, 204, null);
    if (path === "/auth/v1/recover") return send(res, 200, {});
    if (path === "/auth/v1/.well-known/jwks.json") return send(res, 200, { keys: [] });
    return authError(404, "not_found", `mock: ${req.method} ${path} not implemented`);
  }

  // ------------------------------------------------------------------
  // データAPI（PostgREST のまね）
  // ------------------------------------------------------------------
  async function typesOf(table) {
    if (!columnTypes.has(table)) {
      const { rows } = await pool.query(
        "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1",
        [table],
      );
      columnTypes.set(table, new Map(rows.map((r) => [r.column_name, r.data_type])));
    }
    return columnTypes.get(table);
  }

  function ident(name) {
    if (!IDENT.test(name)) throw Object.assign(new Error(`bad identifier ${name}`), { status: 400 });
    return `"${name}"`;
  }

  function parseList(inner) {
    const out = [];
    let cur = "";
    let quoted = false;
    for (const ch of inner) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function condition(column, expr, params) {
    const col = ident(column);
    const dot = expr.indexOf(".");
    let op = expr.slice(0, dot);
    let value = expr.slice(dot + 1);
    let negate = false;
    if (op === "not") {
      negate = true;
      const d2 = value.indexOf(".");
      op = value.slice(0, d2);
      value = value.slice(d2 + 1);
    }
    let sql;
    if (op === "is") {
      sql = `${col} is ${value === "null" ? "null" : value === "true" ? "true" : "false"}`;
    } else if (op === "in") {
      params.push(parseList(value.replace(/^\(|\)$/g, "")));
      sql = `${col} = any($${params.length})`;
    } else if (OPS[op]) {
      params.push(op.endsWith("like") ? value.replace(/\*/g, "%") : value);
      sql = `${col} ${OPS[op]} $${params.length}`;
    } else {
      throw Object.assign(new Error(`unsupported operator ${op}`), { status: 400 });
    }
    return negate ? `not (${sql})` : sql;
  }

  function whereClause(searchParams, params) {
    const parts = [];
    for (const [key, value] of searchParams) {
      if (RESERVED.has(key)) continue;
      parts.push(condition(key, value, params));
    }
    const or = searchParams.get("or");
    if (or) {
      const items = parseList(or.replace(/^\(|\)$/g, "")).map((item) => {
        const d = item.indexOf(".");
        return condition(item.slice(0, d), item.slice(d + 1), params);
      });
      parts.push(`(${items.join(" or ")})`);
    }
    return parts.length ? ` where ${parts.join(" and ")}` : "";
  }

  function selectList(searchParams) {
    const select = searchParams.get("select") ?? "*";
    if (select === "*") return "*";
    return select
      .split(",")
      .map((c) => ident(c.trim()))
      .join(", ");
  }

  async function toParam(table, column, value) {
    const types = await typesOf(table);
    const type = types.get(column);
    if (value === null || value === undefined) return null;
    if (type === "jsonb" || type === "json") return JSON.stringify(value);
    return value;
  }

  async function handleRest(req, res, path, body, role, claims) {
    const url = new URL(req.url, "http://x");
    const table = path.replace("/rest/v1/", "");
    ident(table);
    const prefer = req.headers.prefer ?? "";
    const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const representation = prefer.includes("return=representation");
    const params = [];
    let sql;

    if (req.method === "GET" || req.method === "HEAD") {
      if (req.method === "HEAD" || prefer.includes("count=exact")) {
        const countParams = [];
        const countSql = `select count(*)::int as n from public.${ident(table)}${whereClause(url.searchParams, countParams)}`;
        const count = (await runAs(role, claims, countSql, countParams)).rows[0].n;
        res.setHeader("Content-Range", `*/${count}`);
        if (req.method === "HEAD") return send(res, 200, null);
      }
      sql = `select ${selectList(url.searchParams)} from public.${ident(table)}${whereClause(url.searchParams, params)}`;
      const order = url.searchParams.get("order");
      if (order) {
        sql += ` order by ${order
          .split(",")
          .map((o) => {
            const [col, dir, nulls] = o.split(".");
            return `${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullslast" ? " nulls last" : nulls === "nullsfirst" ? " nulls first" : ""}`;
          })
          .join(", ")}`;
      }
      const limit = Number(url.searchParams.get("limit"));
      if (limit > 0) sql += ` limit ${Math.floor(limit)}`;
      const offset = Number(url.searchParams.get("offset"));
      if (offset > 0) sql += ` offset ${Math.floor(offset)}`;
    } else if (req.method === "POST") {
      const rows = Array.isArray(body) ? body : [body];
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const values = [];
      for (const row of rows) {
        const placeholders = [];
        for (const c of columns) {
          if (!(c in row)) {
            placeholders.push("default");
            continue;
          }
          params.push(await toParam(table, c, row[c]));
          placeholders.push(`$${params.length}`);
        }
        values.push(`(${placeholders.join(", ")})`);
      }
      sql = `insert into public.${ident(table)} (${columns.map(ident).join(", ")}) values ${values.join(", ")}`;
      const onConflict = url.searchParams.get("on_conflict");
      if (onConflict && prefer.includes("resolution=merge-duplicates")) {
        const keys = onConflict.split(",").map((k) => k.trim());
        const updates = columns.filter((c) => !keys.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
        sql += ` on conflict (${keys.map(ident).join(", ")}) do update set ${updates.join(", ")}`;
      } else if (onConflict && prefer.includes("resolution=ignore-duplicates")) {
        const keys = onConflict.split(",").map((k) => k.trim());
        sql += ` on conflict (${keys.map(ident).join(", ")}) do nothing`;
      }
      if (representation) sql += ` returning ${selectList(url.searchParams)}`;
    } else if (req.method === "PATCH") {
      const sets = [];
      for (const [c, v] of Object.entries(body)) {
        params.push(await toParam(table, c, v));
        sets.push(`${ident(c)} = $${params.length}`);
      }
      sql = `update public.${ident(table)} set ${sets.join(", ")}${whereClause(url.searchParams, params)}`;
      if (representation) sql += ` returning ${selectList(url.searchParams)}`;
    } else if (req.method === "DELETE") {
      sql = `delete from public.${ident(table)}${whereClause(url.searchParams, params)}`;
      if (representation) sql += ` returning ${selectList(url.searchParams)}`;
    } else {
      return send(res, 405, { message: "method not allowed" });
    }

    const result = await runAs(role, claims, sql, params);
    const rows = result.rows ?? [];
    if (req.method !== "GET" && !representation) return send(res, 201, null);
    if (wantsObject) {
      if (rows.length !== 1) {
        return send(res, 406, {
          code: "PGRST116",
          details: `The result contains ${rows.length} rows`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        });
      }
      return send(res, 200, rows[0]);
    }
    return send(res, req.method === "POST" ? 201 : 200, rows);
  }

  async function runAs(role, claims, sql, params) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [claims ? JSON.stringify(claims) : ""]);
      const result = await client.query(sql, params);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  function pgErrorStatus(error) {
    switch (error.code) {
      case "42501":
        return 403;
      case "23505":
      case "23503":
        return 409;
      case "23514":
      case "22P02":
      case "23502":
        return 400;
      default:
        return error.status ?? 400;
    }
  }

  // ------------------------------------------------------------------
  // 共通
  // ------------------------------------------------------------------
  function send(res, status, body) {
    if (body === null) {
      res.writeHead(status);
      return res.end();
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  const log = [];

  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return send(res, 400, { message: "invalid json" });
    }

    const apikey = req.headers.apikey;
    if (apikey !== publishableKey && apikey !== secretKey) {
      return send(res, 401, { message: "Invalid API key" });
    }

    try {
      if (path.startsWith("/auth/v1/")) return await handleAuth(req, res, path, body);
      if (path.startsWith("/rest/v1/")) {
        const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
        let role = "anon";
        let claims = null;
        if (bearer === secretKey) role = "service_role";
        else if (bearer && bearer !== publishableKey) {
          claims = verifyJwt(bearer);
          if (!claims) return send(res, 401, { code: "PGRST301", message: "JWT invalid" });
          role = "authenticated";
        }
        log.push({ method: req.method, path, role });
        return await handleRest(req, res, path, body, role, claims);
      }
      return send(res, 404, { message: "not found" });
    } catch (error) {
      return send(res, pgErrorStatus(error), {
        code: error.code ?? "",
        message: error.message,
        details: error.detail ?? null,
        hint: error.hint ?? null,
      });
    }
  });

  return { server, setupAuthTables, createUser, log };
}
