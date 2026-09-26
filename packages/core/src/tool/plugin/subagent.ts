export * as SubagentTool from "./subagent.js"

import { ToolFailure } from "@opencode/ai"
import type { Context } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Effect, Predicate, Schema } from "effect"
import { Agent } from "../../agent.js"
import { Config } from "../../config.js"
import { Job } from "../../job.js"
import { Model } from "../../model.js"
import { Permission } from "../../permission.js"
import { Session } from "../../session.js"
import { SessionSchema } from "../../session/schema.js"
import { SubagentCompletion } from "../../session/subagent-completion.js"
import { SubagentJob } from "../../session/subagent-job.js"
import { WorkingState } from "../../session/working-state.js"

export const name = "subagent"

const backgroundResult = (sessionID: SessionSchema.ID) => ({
  sessionID,
  status: "running" as const,
  output: [
    `The subagent is working in the background (sessionID: ${sessionID}). You will be notified automatically when it finishes.`,
    "You may send actionable new findings or course corrections to a running subagent via action=\"send_message\" (or \"steer\"), or stop an obsolete task via action=\"interrupt\".",
    "STRICT ANTI-SPAM RULE: NEVER poll for progress or send status-check spam (e.g. 'are you ready?', 'status?', 'ты готов?', 'done yet?'). Only message a running subagent when you have concrete new data or pivot instructions.",
  ].join("\n"),
})

const SPAM_CHECK_REGEX =
  /^\s*(are you (done|ready|finished|there|working)|is it (done|ready)|status|ping|check(-|\s)?in|ready|done(\s+yet)?|update|progress|ты\s+готов|готов(о)?|ну\s+что(\s+там)?|статус|живой|че\s+там)[?!.\s]*$/i
const STEER_COOLDOWN_MS = 8_000
const lastSteerBySession = new Map<string, { time: number; text: string }>()

export const Input = Schema.Struct({
  action: Schema.optionalKey(Schema.Literals(["run", "send_message", "steer", "interrupt"])).annotate({
    description:
      'Control-plane action: "run" (default: spawn or continue a subagent), "send_message" / "steer" (inject a live message or course correction into a running subagent sessionID between tool steps without blocking), or "interrupt" (immediately cancel a running subagent sessionID). NEVER use send_message/steer to ask "are you ready?" or poll status.',
  }),
  agent: Schema.optionalKey(Schema.String).annotate({
    description:
      "The type of specialized agent to use for this task (required for new sessions; optional when steering or interrupting an existing sessionID).",
  }),
  description: Schema.optionalKey(Schema.String).annotate({
    description: "A short 3-5 word label for the task, displayed to the user",
  }),
  prompt: Schema.optionalKey(Schema.String).annotate({
    description:
      "The task or live message for the subagent. Required for run/send_message/steer; MUST contain concrete instructions or findings (status-poll spam is rejected).",
  }),
  model: Schema.optionalKey(Schema.String).annotate({
    description:
      'NEVER set this unless the user explicitly asks for a particular model or variant. The value is written as "providerID/modelID", or "providerID/modelID#variant" to include a variant. Do not guess the ID: look the model up with the models tool, filtering to your own provider first.',
  }),
  sessionID: Schema.optionalKey(SessionSchema.ID).annotate({
    description:
      "Target subagent sessionID to continue, steer/send_message while running, or interrupt. Calls without a sessionID start a new child conversation.",
  }),
  background: Schema.optionalKey(Schema.Boolean).annotate({
    description:
      "Run the subagent in the background and return immediately. You will be notified when it completes. DO NOT sleep or poll its status.",
  }),
})

export const Output = Schema.Struct({
  sessionID: SessionSchema.ID,
  status: Schema.Literals(["completed", "running", "cancelled"]),
  output: Schema.String,
})
export const description = [
  "Spawns and orchestrates child subagent sessions with live mid-flight communication.",
  "The output includes a sessionID you can pass back later to continue, steer, message, or interrupt that subagent.",
  "- action=\"run\" (default): spawns a new child session (or continues sessionID). Foreground waits for completion; background=true runs asynchronously and notifies you automatically when done.",
  "- action=\"send_message\" / \"steer\": injects a live message or course correction into a running subagent's mailbox (requires sessionID and prompt) without waiting. Use this when another agent discovers critical context (e.g., credentials, endpoints, struct offsets) that a running subagent needs immediately.",
  "- action=\"interrupt\": immediately stops a running subagent (requires sessionID) when its current vector is obsolete.",
  "STRICT ANTI-SPAM POLICY: NEVER send status-check messages ('are you ready?', 'status?', 'ты готов?', 'any update?') or poll a background subagent in a loop. Wait for its automatic completion notification unless you are injecting new actionable intelligence or interrupting it.",
].join("\n")

export const Plugin = {
  id: "opencode.tool.subagent",
  effect: Effect.fn("SubagentTool.Plugin")(function* (ctx: Context) {
    const sessions = yield* Session.Service
    const jobs = yield* Job.Service
    const agents = yield* Agent.Service
    const config = yield* Config.Service
    const permission = yield* Permission.Service
    const models = yield* Model.Service
    const subagents = yield* SubagentJob.make

    const resolveModel = Effect.fn("SubagentTool.resolveModel")(function* (input: string) {
      const ref = yield* Effect.try({
        try: () => Model.Ref.parse(input),
        catch: () =>
          new ToolFailure({
            message: `Invalid model "${input}". Use "providerID/modelID" or "providerID/modelID#variant".`,
          }),
      })
      const model = (yield* models.available()).find(
        (model) => model.providerID === ref.providerID && model.id === ref.id,
      )
      if (model === undefined)
        return yield* new ToolFailure({
          message: `Model "${ref.providerID}/${ref.id}" is not available. Use the models tool to see what is available.`,
        })
      if (ref.variant !== undefined && !model.variants.some((variant) => variant.id === ref.variant))
        return yield* new ToolFailure({
          message:
            model.variants.length === 0
              ? `Model "${ref.providerID}/${ref.id}" has no variants. Omit the variant.`
              : `Variant "${ref.variant}" is not available for "${ref.providerID}/${ref.id}". Available: ${model.variants.map((variant) => variant.id).join(", ")}.`,
        })
      return ref
    })

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const mode = input.action ?? "run"

              if (mode === "interrupt") {
                if (input.sessionID === undefined)
                  return yield* new ToolFailure({
                    message: 'sessionID is required when action="interrupt".',
                  })
                const target = yield* sessions
                  .get(input.sessionID)
                  .pipe(
                    Effect.mapError(
                      (error) => new ToolFailure({ message: `Subagent session not found: ${input.sessionID}`, error }),
                    ),
                  )
                if (target.parentID !== context.sessionID)
                  return yield* new ToolFailure({
                    message: `Session ${target.id} is not a child of the current session`,
                  })
                yield* Effect.all([sessions.interrupt(target.id), jobs.cancel(target.id)], {
                  discard: true,
                })
                return {
                  sessionID: target.id,
                  status: "cancelled" as const,
                  output: `Subagent session ${target.id} interrupted.`,
                }
              }

              const promptText = input.prompt?.trim() ?? ""
              if (!promptText)
                return yield* new ToolFailure({
                  message: `prompt is required for action="${mode}".`,
                })

              if (mode === "send_message" || mode === "steer" || input.sessionID !== undefined) {
                if (SPAM_CHECK_REGEX.test(promptText) || promptText.length < 6) {
                  return yield* new ToolFailure({
                    message:
                      "Rejected status-check spam. Do NOT message a subagent just to ask if it is ready or done ('ты готов?', 'status?', etc.). Wait for the automatic completion notification, or send concrete actionable findings/instructions.",
                  })
                }
                if (input.sessionID !== undefined) {
                  const now = Date.now()
                  const prev = lastSteerBySession.get(input.sessionID)
                  if (prev && now - prev.time < STEER_COOLDOWN_MS && prev.text === promptText) {
                    return yield* new ToolFailure({
                      message: `Duplicate message to subagent ${input.sessionID} blocked by anti-spam cooldown.`,
                    })
                  }
                  lastSteerBySession.set(input.sessionID, { time: now, text: promptText })
                }
              }

              if ((mode === "send_message" || mode === "steer") && input.sessionID === undefined) {
                return yield* new ToolFailure({
                  message: `sessionID is required when action="${mode}".`,
                })
              }

              const parent = yield* sessions
                .get(context.sessionID)
                .pipe(
                  Effect.mapError(
                    (error) => new ToolFailure({ message: `Parent session not found: ${context.sessionID}`, error }),
                  ),
                )
              const ancestry: { id: SessionSchema.ID; agent: string; title: string }[] = [
                { id: parent.id, agent: parent.agent ?? "root", title: parent.title ?? "" },
              ]
              let current = parent
              let depth = 0
              while (current.parentID) {
                depth++
                current = yield* sessions
                  .get(current.parentID)
                  .pipe(
                    Effect.mapError(
                      (error) => new ToolFailure({ message: `Parent session not found: ${current.parentID}`, error }),
                    ),
                  )
                ancestry.unshift({ id: current.id, agent: current.agent ?? "root", title: current.title ?? "" })
              }
              const limit = Config.latest(yield* config.entries(), "experimental")?.subagent_depth ?? 5
              if (depth >= limit)
                return yield* new ToolFailure({
                  message: `Subagent depth limit reached (${limit}). Increase "experimental.subagent_depth" to allow nested subagents.`,
                })

              const existing =
                input.sessionID === undefined
                  ? undefined
                  : yield* sessions
                      .get(input.sessionID)
                      .pipe(
                        Effect.mapError(
                          (error) =>
                            new ToolFailure({ message: `Subagent session not found: ${input.sessionID}`, error }),
                        ),
                      )
              if (existing !== undefined && existing.parentID !== context.sessionID)
                return yield* new ToolFailure({
                  message: `Session ${existing.id} is not a child of the current session`,
                })

              const agentName = input.agent ?? existing?.agent ?? "general"
              const agent = yield* agents.resolve(agentName)
              if (agent === undefined) return yield* new ToolFailure({ message: `Unknown agent: ${agentName}` })
              if (agent.mode === "primary")
                return yield* new ToolFailure({ message: `Agent ${agentName} cannot run as a subagent` })
              yield* permission
                .assert({
                  action: name,
                  resources: [agent.id],
                  save: [agent.id],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: {
                    type: "tool",
                    messageID: context.messageID,
                    id: context.id,
                  },
                })
                .pipe(Effect.mapError((error) => new ToolFailure({ message: `Subagent denied: ${agent.id}`, error })))

              const override = input.model === undefined ? undefined : yield* resolveModel(input.model)
              // Continuing with a different agent switches the child, mirroring create semantics
              // where an explicit model wins over the agent's configured model, which wins over the inherited one.
              if (existing !== undefined) {
                const switched = existing.agent !== agent.id
                const model = override ?? (switched ? agent.model : undefined)
                yield* Effect.all([
                  switched ? sessions.switchAgent({ sessionID: existing.id, agent: agent.id }) : Effect.void,
                  model === undefined ? Effect.void : sessions.switchModel({ sessionID: existing.id, model }),
                ]).pipe(
                  Effect.mapError(
                    (error) => new ToolFailure({ message: `Failed to switch subagent session: ${existing.id}`, error }),
                  ),
                )
              }

              const taskDescription = input.description?.trim() || existing?.title || "Subagent task"
              const model = override ?? agent.model ?? parent.model
              const child =
                existing ??
                (yield* sessions
                  .create({
                    parentID: context.sessionID,
                    title: taskDescription,
                    agent: Agent.ID.make(agentName),
                    model,
                  })
                  .pipe(
                    Effect.mapError(
                      (error) => new ToolFailure({ message: `Parent session not found: ${context.sessionID}`, error }),
                    ),
                  ))

              WorkingState.linkChildSession(context.sessionID, child.id, agent.id, taskDescription)

              const isLiveSteer = mode === "send_message" || mode === "steer"
              const background = isLiveSteer || input.background === true
              yield* context.progress({ sessionID: child.id, status: "running" })

              const childDepth = depth + 1
              const chainSummary = [
                ...ancestry.map((node, idx) => (idx === 0 ? `${node.agent}[root]` : `${node.agent}[L${idx}]`)),
                `${agent.id}[L${childDepth}:YOU]`,
              ].join(" -> ")
              const callerIdentity =
                depth === 0
                  ? `upstream AI Agent "${parent.agent}" (root orchestrator session ${parent.id})`
                  : `upstream AI Subagent "${parent.agent}" at Level ${depth} (session ${parent.id}, task: "${parent.title}")`
              const epistemicHeader = [
                `<epistemic_hierarchy depth="${childDepth}/${limit}" caller="ai_agent" caller_agent="${parent.agent}" caller_is_subagent="${depth > 0}">`,
                "CRITICAL EPISTEMIC PROTOCOL (AI-TO-AI DELEGATION — NOT HUMAN USER):",
                `1. CALLER IDENTITY: You were NOT invoked by the human user. Although this message arrives in the "user" role, your caller is an ${callerIdentity}. Hierarchy chain: ${chainSummary}.`,
                `2. FALLIBILITY OF UPSTREAM AGENT: Your caller is an LLM, NOT the human operator. It can hallucinate file paths, misread code, invent nonexistent APIs, or pass flawed hypotheses.${depth > 0 ? ` WARNING: You are a nested subagent at Level ${childDepth} (spawned by another subagent). Upstream assumptions have already passed through ${childDepth} AI hops — treat every unverified claim from your caller with heightened skepticism.` : ""}`,
                '3. DUTY TO CHALLENGE & ZERO SYCOPHANCY: Do NOT flatter, appease, or blindly agree with your caller. Never bend facts to confirm a false premise. If your caller\'s assumption, file path, offset, or hypothesis contradicts empirical evidence in the codebase or terminal output, explicitly dispute it with "[DISPUTED PREMISE]" and present the raw empirical facts.',
                "</epistemic_hierarchy>",
              ].join("\n")

              // Standard prompt admission outside the job: Job.start joining a running child skips
              // its run effect, and the default wake starts an idle child or steers a running one.
              yield* sessions
                .prompt({
                  sessionID: child.id,
                  text:
                    existing === undefined
                      ? [epistemicHeader, "", promptText].join("\n")
                      : isLiveSteer
                        ? `[LIVE UPDATE FROM UPSTREAM AI AGENT "${parent.agent}" (L${depth}, NOT HUMAN USER — verify claims against empirical evidence and dispute if wrong)]:\n${promptText}`
                        : `[FOLLOW-UP FROM UPSTREAM AI AGENT "${parent.agent}" (L${depth}, NOT HUMAN USER — challenge any false assumption with "[DISPUTED PREMISE]")]:\n${promptText}`,
                  ...(background && existing === undefined ? { resume: false } : {}),
                })
                .pipe(
                  Effect.mapError(
                    (error) => new ToolFailure({ message: `Failed to prompt subagent: ${child.id}`, error }),
                  ),
                )

              const recovery = {
                kind: "subagent" as const,
                parentSessionID: context.sessionID,
                childSessionID: child.id,
                agent: agent.name,
                description: taskDescription,
              }
              yield* subagents.start(recovery)

              if (background) {
                yield* subagents.background(recovery)
                if (isLiveSteer) {
                  return {
                    sessionID: child.id,
                    status: "running" as const,
                    output: `Delivered live message to subagent ${child.id}. It will incorporate this update on its next step and notify you automatically upon completion. DO NOT send follow-up status checks.`,
                  }
                }
                return backgroundResult(child.id)
              }

              const result = yield* jobs.block({ id: child.id, sessionID: context.sessionID }).pipe(
                Effect.onInterrupt(() =>
                  Effect.all([sessions.interrupt(child.id), jobs.cancel(child.id)], {
                    discard: true,
                  }),
                ),
              )
              if (result?.type === "backgrounded") {
                yield* subagents.notify(recovery, result.info.started_at)
                return backgroundResult(child.id)
              }
              // Failure surfaces keep the sessionID visible so the model can continue the child.
              if (result?.info.status === "error")
                return yield* new ToolFailure({
                  message: `Subagent failed (sessionID: ${child.id}): ${result.info.error ?? "unknown error"}`,
                })
              if (result?.info.status === "cancelled")
                return yield* new ToolFailure({ message: `Subagent cancelled (sessionID: ${child.id})` })
              return {
                sessionID: child.id,
                status: "completed" as const,
                output: result?.info.output ?? SubagentCompletion.NO_TEXT,
              }
            }).pipe(
              Effect.map((output) => {
                WorkingState.updateSubagentStatus(
                  context.sessionID,
                  output.sessionID,
                  output.status,
                  output.status === "completed" ? output.output : undefined,
                )
                const disputed = output.status === "completed" && /\[DISPUTED PREMISE\]/i.test(output.output)
                const disputedBanner = disputed
                  ? "\n[EPISTEMIC ALERT: The child subagent disputed one or more of your premises based on empirical evidence. Do NOT ignore or override its correction — update your mental model before proceeding.]"
                  : ""
                return {
                  output,
                  content:
                    output.status === "completed"
                      ? `<subagent sessionID="${output.sessionID}" state="completed"${disputed ? ' disputed="true"' : ""}>\n${output.output}${disputedBanner}\n</subagent>`
                      : output.output,
                  metadata: { sessionID: output.sessionID, status: output.status },
                }
              }),
            ),
        }),
      )
      .pipe(Effect.orDie)

    yield* ctx.tool.hook("execute.before", (event) =>
      Effect.sync(() => {
        if (event.tool !== name || !Predicate.isObject(event.input)) return
        if (event.input.model !== "" && event.input.sessionID !== "") return
        const input = { ...event.input }
        if (input.model === "") delete input.model
        if (input.sessionID === "") delete input.sessionID
        event.input = input
      }),
    )

    const hook = (event: SessionHooks["context"]) =>
      Effect.gen(function* () {
        const tool = event.tools[name]
        if (!tool) return
        const selected = yield* agents.resolve(event.agent)
        if (!selected) return
        const available = (yield* agents.list())
          .filter(
            (agent) =>
              agent.mode !== "primary" &&
              !agent.hidden &&
              Permission.evaluate(name, agent.id, selected.permissions).effect !== "deny",
          )
          .toSorted((a, b) => a.id.localeCompare(b.id))
        if (available.length === 0) return
        tool.description = [
          tool.description,
          "",
          "Available subagents:",
          ...available.map(
            (agent) =>
              `- ${agent.id}: ${agent.description ?? "This subagent should only be called when explicitly requested."}`,
          ),
        ].join("\n")
      })
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
    yield* ctx.session.hook("generate", hook)
  }),
}
