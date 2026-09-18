# Eutrya v0.4.7 — Interactive Context Controls (Public Alpha)

This release adds live CLI controls for context size and Jev auto-compaction.

## New commands

```text
/context
/context 64k
/context 64000
/autocompact
/autocompact on
/autocompact off
```

`/context` configures Eutrya's `maxPromptChars` setting, which is measured in serialized prompt characters rather than model tokens. Accepted values are 4k through 200k.

Both settings persist to the active profile config and take effect on the next agent turn without requiring a process restart. Eutrya recycles idle resident runtimes so newly created runtime instances receive the updated compaction/context configuration while reusing their durable session state.
