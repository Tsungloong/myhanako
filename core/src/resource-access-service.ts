export type ResourceAccessLevel = "restricted" | "full-access"

export type ResourceAccessSubject = {
  readonly type: "plugin" | "tool" | "system"
  readonly id: string
  readonly access?: ResourceAccessLevel
  readonly permissions: readonly string[]
}

export type ResourceAccessRequest = {
  readonly sessionId: string
  readonly subject: ResourceAccessSubject
  readonly resource: string
  readonly operation: string
  readonly permission: string
}

export type FacadeResourceAccessRequest = Omit<ResourceAccessRequest, "subject">

export type ResourceAccessDecision =
  | {
      readonly allowed: true
    }
  | {
      readonly allowed: false
      readonly reason: string
    }

export type RestrictedServiceFacade = {
  readonly subject: ResourceAccessSubject
  readonly permissions: readonly string[]
  authorize(request: FacadeResourceAccessRequest): ResourceAccessDecision
  assertAllowed(request: FacadeResourceAccessRequest): void
}

const FULL_ACCESS_RESOURCES = new Set(["extension"])

export class ResourceAccessService {
  authorize(request: ResourceAccessRequest): ResourceAccessDecision {
    if (
      FULL_ACCESS_RESOURCES.has(request.resource) &&
      request.subject.access !== "full-access"
    ) {
      return denied(
        `Resource ${request.resource} requires full-access subject: ${request.subject.id}`
      )
    }

    if (!request.subject.permissions.includes(request.permission)) {
      return denied(`Permission not granted: ${request.permission}`)
    }

    return { allowed: true }
  }

  assertAllowed(request: ResourceAccessRequest): void {
    const decision = this.authorize(request)
    if (!decision.allowed) {
      throw new Error(decision.reason)
    }
  }

  createFacade(subject: ResourceAccessSubject): RestrictedServiceFacade {
    const facadeSubject: ResourceAccessSubject = {
      ...subject,
      permissions: [...subject.permissions]
    }

    return {
      subject: facadeSubject,
      permissions: [...facadeSubject.permissions],
      authorize: (request) =>
        this.authorize({
          ...request,
          subject: facadeSubject
        }),
      assertAllowed: (request) =>
        this.assertAllowed({
          ...request,
          subject: facadeSubject
        })
    }
  }
}

function denied(reason: string): ResourceAccessDecision {
  return {
    allowed: false,
    reason
  }
}
