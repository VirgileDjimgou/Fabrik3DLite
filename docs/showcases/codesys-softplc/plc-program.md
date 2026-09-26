# Reference PLC program (self-authored, license-safe)

## Why this is not a CODESYS project file

The CODESYS Development System and its project format are proprietary. Its redistribution terms were
not verified for this repository, so **no CODESYS project, library or vendor source is committed**.
Instead this file contains a self-authored, vendor-neutral **IEC 61131-3 Structured Text (ST)**
reference program that implements the same sequence as the showcase. It can be pasted into any
IEC 61131-3 environment (CODESYS, OpenPLC, TwinCAT, or a soft PLC) and bound to the Modbus holding
registers described in [`io-map.md`](./io-map.md).

Attribution and license: authored for Fabrik3D sprint S46, released under the repository license. No
third-party PLC code, library or vendor symbol is included. “CODESYS” is named only as an example
environment; this is not a CODESYS-certified program and no vendor partnership is implied.

## Controller responsibility vs. cell responsibility

- The **PLC** (this program) sequences the run: it requests start, presents the pallet, sets the
  transfer-axis setpoint, and reacts to status feedback.
- The **Fabrik3D cell** owns the actuator/CNC behavior and the safety interlocks; it only moves when
  it holds external control authority and its permissives are satisfied. The PLC never bypasses the
  cell interlocks — it observes `Ready`, `Fault` and the completion latches.

## I/O binding (matches `io-map.json`)

```text
%MW0  bits 0..2  -> Start / Stop / Reset        (PLC -> cell, direction "read")
%MW1  bit 0      -> PalletPresent               (PLC -> cell)
%MW2             -> CycleTarget (0..100)        (PLC -> cell)
%MW10 bits 0..5  -> Ready/Running/RobotDone/CncDone/CycleDone/Fault  (cell -> PLC, "write")
%MW11            -> ActuatorPosition            (cell -> PLC)
%MW12            -> SensorPosition              (cell -> PLC, closed-loop feedback)
%MW13            -> PartsCompleted              (cell -> PLC)
```

The exact bit/register numbers are configuration; a different convention only changes the binding,
not this logic.

## Structured Text reference program

```pascal
FUNCTION_BLOCK FB_Fabrik3DShowcaseSequence
VAR_INPUT
    Start          : BOOL;   (* operator start button, %MW0.0 *)
    Stop           : BOOL;   (* operator stop button,  %MW0.1 *)
    Reset          : BOOL;   (* operator reset button, %MW0.2 *)
END_VAR

VAR_OUTPUT
    StartCmd       : BOOL;   (* requested command bits written to %MW0 *)
    StopCmd        : BOOL;
    ResetCmd       : BOOL;
    PalletPresent  : BOOL;   (* simulated photo-eye, %MW1.0 *)
    CycleTarget    : UINT;   (* transfer-axis setpoint, %MW2 *)

    Ready              : BOOL;  (* feedback read from %MW10 *)
    Running            : BOOL;
    RobotCycleComplete : BOOL;
    CncCycleComplete   : BOOL;
    CycleComplete      : BOOL;
    Fault              : BOOL;
    ActuatorPosition   : UINT;  (* %MW11 *)
    SensorPosition     : UINT;  (* %MW12, closed-loop feedback *)
    PartsCompleted     : UINT;  (* %MW13 *)
END_VAR

VAR
    step         : INT := 0;
    latchStop    : BOOL := FALSE;
    palletTimer  : TON;
END_VAR

(* Deterministic sequence, one transition per scan. *)
CASE step OF
    0:  (* IDLE / PERMISSIVES: wait for the cell to be ready *)
        StartCmd  := FALSE;
        StopCmd   := latchStop;
        ResetCmd  := TRUE;          (* hold reset until the fault latch clears *)
        PalletPresent := FALSE;
        CycleTarget   := 0;
        IF Reset AND NOT Fault AND Ready THEN
            ResetCmd := FALSE;
            step := 1;
        END_IF;

    1:  (* START: pulse start only when the cell is ready *)
        IF NOT Stop THEN
            StartCmd := TRUE;
            step := 2;
        ELSE
            step := 0;
        END_IF;

    2:  (* PALLET DETECTION: present the pallet and release start *)
        StartCmd := FALSE;
        PalletPresent := TRUE;
        palletTimer(IN := TRUE, PT := T#500MS);
        IF palletTimer.Q THEN
            CycleTarget := 100;     (* request the full transfer stroke *)
            palletTimer(IN := FALSE);
            step := 3;
        END_IF;

    3:  (* ROBOT CYCLE: wait for the robot transfer to complete *)
        IF Stop THEN
            latchStop := TRUE;
            step := 5;
        ELSIF RobotCycleComplete THEN
            step := 4;
        END_IF;

    4:  (* CNC CYCLE: wait for the machining cycle to complete *)
        IF Stop THEN
            latchStop := TRUE;
            step := 5;
        ELSIF CncCycleComplete AND CycleComplete THEN
            step := 6;
        END_IF;

    5:  (* FAULT: wait for the operator to acknowledge *)
        StartCmd := FALSE;
        IF NOT Stop AND Reset THEN
            ResetCmd := TRUE;
            latchStop := FALSE;
            step := 0;
        END_IF;

    6:  (* COMPLETE: finished pallet counted; return to idle on reset *)
        IF Reset THEN
            ResetCmd := TRUE;
            PalletPresent := FALSE;
            step := 0;
        END_IF;
END_CASE;

(* The controller never writes the cell outputs itself; it reads the feedback the
   Fabrik3D cell publishes. A lost lease is surfaced as Fault by the cell, which
   drives step 5 above. *)
```

## Notes

- The program is intentionally small and deterministic. It demonstrates the operator/PLC sequence,
  not a production machine program. It has no safety-rating claim.
- Losing the Fabrik3D connector (or the authority lease) makes the cell publish `Fault`; the program
  transitions to the fault state and does not attempt to drive the actuator again until reset.
- A real deployment must add the vendor's standard safety functions (emergency stop, guard
  monitoring) outside this educational example.
