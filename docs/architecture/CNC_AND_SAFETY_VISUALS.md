# CNC and safety visuals

S24 keeps CNC state, workflow sequencing and deterministic collision checks outside the renderer. The CNC meshes expose semantic visual nodes (`door:loading`, `spindle:main`, `fixture:chuck`, `signal:stack-light`) that follow the existing component state only.

`SafetyGuardSystem` renders physical fences, posts, mesh panels, kick plates, an interlocked-gate representation and light-curtain markers separately from the translucent diagnostic corridor. The visual colors map to existing CNC/connection state (`safe`, `running`, `warning`, `offline`); they are educational status cues, not a certified safety function.

The documented robot/CNC loading opening and analytic collision corridor remain defined by the current safety world. Detailed meshes are deliberately not collision authorities. If a future CNC asset fails to load, the procedural CNC continues to provide the same functional workflow.
