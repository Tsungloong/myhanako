import type { ToolDefinitionSnapshot } from "../../shared/src/session-events.ts"
import {
  ResourceAccessService,
  type ResourceAccessSubject
} from "./resource-access-service.ts"

export type ToolExecutionBoundaryRequest = {
  readonly sessionId: string
  readonly toolCallId: string
  readonly tool: ToolDefinitionSnapshot
  readonly subject?: ResourceAccessSubject
}

export class ExecutionBoundary {
  readonly #resourceAccess: ResourceAccessService

  constructor(resourceAccess = new ResourceAccessService()) {
    this.#resourceAccess = resourceAccess
  }

  assertToolExecutionAllowed(request: ToolExecutionBoundaryRequest): void {
    if (!request.subject) {
      throw new Error(`Execution subject required: ${request.tool.id}`)
    }

    for (const permission of request.tool.permissions) {
      this.#resourceAccess.assertAllowed({
        sessionId: request.sessionId,
        subject: request.subject,
        resource: resourceFromPermission(permission),
        operation: "execute",
        permission
      })
    }
  }
}

function resourceFromPermission(permission: string): string {
  const separatorIndex = permission.indexOf(":")
  if (separatorIndex <= 0) {
    return "tool"
  }
  return permission.slice(0, separatorIndex)
}
