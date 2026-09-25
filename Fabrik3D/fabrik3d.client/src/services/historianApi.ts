import type {
  HistorianEvent,
  HistorianPage,
  HistorianQueryClient,
  HistorianQueryParams,
  HistorianTelemetrySample,
} from '../timeTravel/historianSource'
import { queryHistorianEvents, queryHistorianTelemetry } from './orchestratorApi'

/**
 * Read-only adapter from the orchestrator historian REST queries to the
 * framework-independent `HistorianQueryClient` used by the time-travel engine
 * (S41). It only exposes GET queries; there is no command or write path here.
 */
export const historianQueryClient: HistorianQueryClient = {
  async queryTelemetry(params: HistorianQueryParams): Promise<HistorianPage<HistorianTelemetrySample>> {
    return queryHistorianTelemetry(params)
  },
  async queryEvents(params: HistorianQueryParams & { kind?: string }): Promise<HistorianPage<HistorianEvent>> {
    return queryHistorianEvents(params)
  },
}
