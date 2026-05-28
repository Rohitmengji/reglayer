/**
 * RegLayer — API Error Utilities Tests
 *
 * WHY: Error response helpers must return correct status codes and JSON shape.
 * WHAT: Tests badRequest(), unauthorized(), forbidden(), notFound(), serverError() helpers.
 * HOW: Unit tests verifying status code, Content-Type header, and { error } body format.
 */
import { describe, it, expect } from "vitest";
import {
  unauthorized,
  forbidden,
  badRequest,
  notFound,
  tooManyRequests,
  serverError,
} from "@/lib/utils/api-errors";

describe("API Error Helpers", () => {
  describe("unauthorized", () => {
    it("returns 401 with default message", async () => {
      const res = unauthorized();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Authentication required");
    });

    it("returns 401 with custom message", async () => {
      const res = unauthorized("Token expired");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Token expired");
    });
  });

  describe("forbidden", () => {
    it("returns 403 with default message", async () => {
      const res = forbidden();
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Access denied");
    });

    it("returns 403 with custom message", async () => {
      const res = forbidden("Insufficient permissions");
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Insufficient permissions");
    });
  });

  describe("badRequest", () => {
    it("returns 400 with message", async () => {
      const res = badRequest("Invalid email format");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid email format");
    });

    it("includes details when provided", async () => {
      const res = badRequest("Validation failed", { field: "url", reason: "required" });
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(body.details).toEqual({ field: "url", reason: "required" });
    });

    it("omits details when not provided", async () => {
      const res = badRequest("Missing field");
      const body = await res.json();
      expect(body.details).toBeUndefined();
    });
  });

  describe("notFound", () => {
    it("returns 404 with default resource", async () => {
      const res = notFound();
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Resource not found");
    });

    it("returns 404 with custom resource name", async () => {
      const res = notFound("Scan");
      const body = await res.json();
      expect(body.error).toBe("Scan not found");
    });
  });

  describe("tooManyRequests", () => {
    it("returns 429 with default message", async () => {
      const res = tooManyRequests();
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe("Too many requests. Please try again later.");
    });
  });

  describe("serverError", () => {
    it("returns 500 with default message", async () => {
      const res = serverError();
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Internal server error");
    });
  });
});
