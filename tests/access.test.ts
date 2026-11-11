import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { signToken } from "../src/lib/auth/jwt";
import { isLanHost, validAccessToken } from "../src/lib/auth/access";
import { middleware } from "../src/middleware";
import { JWT_SECRET } from "../src/lib/auth/secret";

const readPaths = ["/api/tasks", "/api/projects", "/api/agents", "/api/activity/feed", "/api/office/dcm"];
function request(path: string, method = "GET", host = "192.168.21.166:3000", token?: string, cookie = false) {
  return new NextRequest(`http://${host}${path}`, { method, headers: {
    host, "x-forwarded-for": "test-access",
    ...(token ? cookie ? { cookie: `ai-office-token=${token}` } : { authorization: `Bearer ${token}` } : {}),
  } });
}

test("board is public; its GET APIs are anonymous only on LAN", async () => {
  assert.equal((await middleware(request("/office/board", "GET", "office.example.com"))).status, 200);
  for (const path of readPaths) {
    assert.equal((await middleware(request(path))).status, 200, path);
    assert.equal((await middleware(request(path, "GET", "office.example.com"))).status, 401, path);
  }
  assert.equal((await middleware(request("/api/agents/registry"))).status, 401);
});

test("all write methods need authentication, including legacy public prefixes on LAN", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const path of [...readPaths, "/api/tasks/example/status", "/api/agents/registry", "/api/activity/log"]) {
      assert.equal((await middleware(request(path, method))).status, 401, `${method} ${path}`);
    }
  }
});

test("admin and auth/me require a valid login even on LAN", async () => {
  assert.equal((await middleware(request("/office/admin"))).status, 307);
  assert.equal((await middleware(request("/api/auth/me"))).status, 401);
  assert.equal((await middleware(request("/api/auth/login", "POST"))).status, 200);
  for (const token of ["garbage", "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ."]) {
    assert.equal(await validAccessToken(token), false);
    assert.equal((await middleware(request("/office/admin", "GET", "localhost", token))).status, 307);
  }
  const token = signToken({ userId: "test", username: "test", role: "admin" });
  assert.equal(await validAccessToken(token), true);
  assert.equal(await validAccessToken(token.slice(0, -5) + "wrong"), false);
  assert.equal(await validAccessToken(jwt.sign({ userId: "test", username: "test", role: "admin" }, JWT_SECRET, { expiresIn: -1 })), false);
  for (const cookie of [false, true]) {
    assert.equal((await middleware(request("/office/admin", "GET", "localhost", token, cookie))).status, 200);
    assert.equal((await middleware(request("/api/tasks", "POST", "localhost", token, cookie))).status, 200);
  }
});

test("LAN host matching rejects lookalike domains and invalid IPv4", () => {
  for (const host of ["192.168.1.2:3000", "10.0.0.1", "172.16.0.1", "172.31.255.255", "localhost:3000", "[::1]:3000"]) {
    assert.equal(isLanHost(host), true, host);
  }
  for (const host of ["10.evil.test", "192.168.1.2.example.com", "10.999.0.1", "172.15.0.1", "172.32.0.1", "office.example.com", ""]) {
    assert.equal(isLanHost(host), false, host);
  }
});
