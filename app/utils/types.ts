export interface Platform {
  Os?: string;
  Arch?: string;
  Variant?: string;
}
export interface Referrer {
  Digest: string;
  MediaType?: string;
  ArtifactType?: string;
  Size?: number;
  Annotations?: { Key: string; Value: string }[];
}
export interface Layer {
  Digest?: string;
  Size?: number | string;
}
export interface Manifest {
  Digest: string;
  ConfigDigest?: string;
  Platform?: Platform;
  Size?: string;
  LastUpdated?: string;
  ArtifactType?: string;
  Layers?: Layer[];
  History?: { Layer?: Layer; HistoryDescription?: { CreatedBy?: string; EmptyLayer?: boolean } }[];
  Referrers?: Referrer[];
}
export interface Image {
  AffectedTags?: string[];
  MediaType?: string;
  RepoName?: string;
  Tag?: string;
  Digest: string;
  Description?: string;
  Title?: string;
  Vendor?: string;
  Licenses?: string;
  Source?: string;
  Documentation?: string;
  Size?: string;
  LastUpdated?: string;
  IsDeletable?: boolean;
  Manifests?: Manifest[];
  Referrers?: Referrer[];
  ArtifactType?: string;
}
export interface Repo {
  TagCount?: number;
  Error?: string;
  Name: string;
  LastUpdated?: string;
  Size?: string;
  Platforms?: Platform[];
  Vendors?: string[];
  RepresentativeImage?: Image;
}
