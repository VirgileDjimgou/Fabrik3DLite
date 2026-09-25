/**
 * Sample mapping file for the CNC machine-tending reference cell (single conveyor).
 *
 * Every entry references a signal that is really declared by the reference cell
 * equipment definitions (S32) and covers all three protocols with read and write
 * directions. It is deterministic and safe to apply against a fixture.
 */

import { MAPPING_SCHEMA_VERSION, type MappingFileV1 } from './schema'

export const REFERENCE_CELL_MAPPING_ID = 'reference-cell-mapping'
export const REFERENCE_CELL_MAPPING_FILENAME = 'reference-cell-mapping.json'

export function createReferenceCellSampleMapping(): MappingFileV1 {
  return {
    schemaVersion: MAPPING_SCHEMA_VERSION,
    id: REFERENCE_CELL_MAPPING_ID,
    name: 'Reference cell signal mapping',
    description: 'Sample OPC UA / MQTT / Modbus mapping for the CNC machine-tending reference cell.',
    entries: [
      {
        id: 'opcua-cnc-spindle-speed',
        name: 'CNC spindle speed to OPC UA',
        protocol: 'opcua',
        internalSignalId: 'cnc-1.SpindleSpeed',
        equipmentId: 'cnc-1',
        direction: 'read',
        dataType: 'float',
        scale: 1,
        offset: 0,
        unit: 'rpm',
        enabled: true,
        notes: 'Read-only telemetry published by the external controller.',
        target: { nodeId: 'ns=2;s=Fabrik3D/CNC/SpindleSpeed' },
      },
      {
        id: 'opcua-robot-start',
        name: 'Robot start command from OPC UA',
        protocol: 'opcua',
        internalSignalId: 'robot-1.Start',
        equipmentId: 'robot-1',
        direction: 'write',
        dataType: 'bool',
        scale: 1,
        offset: 0,
        enabled: true,
        target: { nodeId: 'ns=2;s=Fabrik3D/Robot/Start' },
      },
      {
        id: 'mqtt-conveyor-actual-speed',
        name: 'Conveyor actual speed over MQTT telemetry',
        protocol: 'mqtt',
        internalSignalId: 'conveyor-1.ActualSpeed',
        equipmentId: 'conveyor-1',
        direction: 'read',
        dataType: 'float',
        scale: 1,
        offset: 0,
        unit: 'm/s',
        enabled: true,
        target: {
          topic: 'fabrik3d/v1/cells/single-conveyor-machining-cell/equipment/conveyor-1/telemetry',
          payloadField: 'ActualSpeed',
        },
      },
      {
        id: 'mqtt-conveyor-run-command',
        name: 'Conveyor run command over MQTT',
        protocol: 'mqtt',
        internalSignalId: 'conveyor-1.RunCommand',
        equipmentId: 'conveyor-1',
        direction: 'write',
        dataType: 'bool',
        scale: 1,
        offset: 0,
        enabled: true,
        target: {
          topic: 'fabrik3d/v1/cells/single-conveyor-machining-cell/equipment/conveyor-1/command',
          payloadField: 'RunCommand',
          retain: false,
        },
      },
      {
        id: 'modbus-cnc-feed-rate',
        name: 'CNC feed rate from holding register',
        protocol: 'modbus',
        internalSignalId: 'cnc-1.FeedRate',
        equipmentId: 'cnc-1',
        direction: 'read',
        dataType: 'float',
        scale: 1,
        offset: 0,
        unit: 'mm/min',
        enabled: true,
        target: {
          area: 'holding-register',
          address: 10,
          width: 32,
          byteOrder: 'big-endian',
          wordOrder: 'high-word-first',
        },
      },
      {
        id: 'modbus-cnc-cycle-start',
        name: 'CNC cycle start bit',
        protocol: 'modbus',
        internalSignalId: 'cnc-1.CycleStart',
        equipmentId: 'cnc-1',
        direction: 'write',
        dataType: 'bool',
        scale: 1,
        offset: 0,
        enabled: true,
        target: {
          area: 'holding-register',
          address: 20,
          width: 16,
          bitIndex: 3,
          byteOrder: 'big-endian',
          addressConvention: 'zero-based',
        },
      },
    ],
  }
}
