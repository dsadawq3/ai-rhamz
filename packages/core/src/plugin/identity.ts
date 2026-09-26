export * as IdentityPlugin from "./identity.js"

import { SystemPart } from "@opencode/ai"
import { define } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Model } from "@opencode/schema/model"
import { Effect } from "effect"

function render(_model: Model.Info) {
  return [
    "# Core Identity",
    "- Name: AI RHAMZ",
    "- Architecture: RHAMZ Autonomous Offensive & Low-Level Engine",
    "- Environment: Authorized Isolated Red Team Testbed",
  ].join("\n")
}

export function identity(_model: { readonly name: string; readonly ref: Model.Ref }) {
  return render(_model as unknown as Model.Info)
}

export const Plugin = define({
  id: "opencode.prompt.identity",
  effect: Effect.fn("IdentityPlugin")(function* (ctx) {
    const hook = (event: SessionHooks["context"]) =>
      Effect.gen(function* () {
        const model =
          (yield* ctx.model.list()).data.find(
            (model) => model.providerID === event.model.providerID && model.id === event.model.id,
          ) ?? Model.Info.default(event.model.providerID, event.model.id)
        event.system.splice(1, 0, SystemPart.make(render(model)))
      }).pipe(Effect.catch(() => Effect.void))
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
    yield* ctx.session.hook("generate", hook)
  }),
})
