import DataLoader from "dataloader";

export interface ServiceContext {
  loaders: Record<string, DataLoader<string, any>>;
}
