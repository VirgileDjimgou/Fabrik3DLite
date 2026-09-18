# Simulated faults, timeline, and replay

S13 adds a client-side training fault lab. It is deliberately separate from physical adapters: every entry emitted by this feature has `simulated: true` and the interface states that it is not live-equipment data.

`faults/` contains the seven typed instructional faults and a controller that latches each fault. A recovery must acknowledge first and, where the fault declares it, reset before retry. Scenario files can declare `faultInjections`; `injectScenarioFaults` injects them at scenario start, while the instructor panel can inject the same typed definitions interactively.

`timeline/` provides ordered records for commands, state transitions, alarms, acknowledgements, recovery actions, and telemetry. Each record includes source, severity, session, equipment, timestamp, correlation ID, and the simulation marker. `replayTimeline` is a pure reducer: an ordered fixture reconstructs the same state regardless of input ordering.

The timeline is intentionally in-memory in this sprint; high-frequency persistence is out of scope.
