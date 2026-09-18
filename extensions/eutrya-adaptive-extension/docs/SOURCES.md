# API verification sources

Consulted 2026-09-17 America/Phoenix. These explain the API contract used by the adapter; they do not validate the user's deployed credentials or current swarm code.

- Vercel, **Evaluation**: https://vercel.com/docs/ai-gateway/modalities/evaluation
  Typed choices, boolean probabilities and scores; multiple questions sharing one request; AI SDK-only evaluation interface. The add-on reuses the host evaluator rather than introducing an SDK dependency.
- OpenRouter, **Streaming**: https://openrouter.ai/docs/api_reference/streaming
  Server-Sent Events, keepalive comments and chunked responses. The included adapter handles those plus explicit failure/truncation and rejects tool calls.
- Vercel, **OpenAI Chat Completions API**: https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions
  Used for text-provider compatibility, not for Jev evaluation.

Local compatibility reference: supplied `eutrya-native-v0.2.0.zip`, specifically `src/runtime.mjs`, `src/providers/jev.mjs`, `src/providers/gateway.mjs` and `src/policy.mjs`. No source from the user's subsequently added swarm was available.

No training, benchmark improvement, calibrated probability, or five-second live-latency claim is inferred from these references.
