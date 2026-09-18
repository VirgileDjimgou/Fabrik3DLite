# Step mode

The simulator has a pedagogical step mode layered on top of the existing pallet machining workflow. It pauses at meaningful workflow phases rather than at rendering frames, so a learner sees one logical action at a time.

`StepModeController` owns checkpoint idempotency. A `Next step` command is consumed once for the active checkpoint; repeated clicks or transport retries do not execute the same checkpoint twice. The panel shows the command, explanation and expected outcome. Frame targets, joint values and safety diagnostics remain available through the existing developer and motion-safety overlays.

Pause and resume use the existing orchestration bridge, keeping an online job/session coherent with the server. Safety checks remain inside `PalletMachiningWorkflow.guardedMove`, so stepping cannot bypass collision or joint-limit validation.

`Previous explanation` only revisits the prior explanation. It intentionally does not attempt arbitrary reverse physics. `Restart` resets the deterministic workflow before a new guided run.
