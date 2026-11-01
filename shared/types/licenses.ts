export interface DependencyLicense {
  name: string
  version: string
  license: string
  url: string
  documents: { file: string; text: string }[]
}
