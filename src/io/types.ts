export interface ReactionDatum {
  reactionId: string
  log2fc: number
  pValue: number
  subsystem?: string
  fluxCond1?: number
  fluxCond2?: number
}

export interface RowError {
  row: number
  message: string
}

export interface ParsedDataset {
  rows: ReactionDatum[]
  errors: RowError[]
  detectedNamespace: string
  hasSubsystem: boolean
  /** canonical field name -> the original header it was matched from */
  columnsFound: Partial<Record<keyof ReactionDatum, string>>
}
