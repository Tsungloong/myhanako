import assert from "node:assert/strict"
import test from "node:test"
import { ResourceAccessService } from "../src/resource-access-service.ts"

test("ResourceAccessService facade grants only declared subject permissions", () => {
  const service = new ResourceAccessService()
  const facade = service.createFacade({
    type: "plugin",
    id: "plugin:notes",
    access: "restricted",
    permissions: ["workspace:read"]
  })

  assert.deepEqual(
    facade.authorize({
      sessionId: "session_security",
      resource: "workspace",
      operation: "read",
      permission: "workspace:read"
    }),
    { allowed: true }
  )

  const denied = facade.authorize({
    sessionId: "session_security",
    resource: "terminal",
    operation: "run",
    permission: "terminal:run"
  })

  assert.deepEqual(denied, {
    allowed: false,
    reason: "Permission not granted: terminal:run"
  })
  assert.throws(
    () =>
      facade.assertAllowed({
        sessionId: "session_security",
        resource: "terminal",
        operation: "run",
        permission: "terminal:run"
      }),
    /Permission not granted: terminal:run/
  )
})

test("ResourceAccessService keeps extension access behind full-access subjects", () => {
  const service = new ResourceAccessService()
  const restrictedFacade = service.createFacade({
    type: "plugin",
    id: "plugin:restricted",
    access: "restricted",
    permissions: ["extension:load"]
  })
  const fullAccessFacade = service.createFacade({
    type: "plugin",
    id: "plugin:full",
    access: "full-access",
    permissions: ["extension:load"]
  })

  assert.deepEqual(
    restrictedFacade.authorize({
      sessionId: "session_security",
      resource: "extension",
      operation: "load",
      permission: "extension:load"
    }),
    {
      allowed: false,
      reason: "Resource extension requires full-access subject: plugin:restricted"
    }
  )

  assert.deepEqual(
    fullAccessFacade.authorize({
      sessionId: "session_security",
      resource: "extension",
      operation: "load",
      permission: "extension:load"
    }),
    { allowed: true }
  )
})
