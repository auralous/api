import { MyGQLContext } from "../types/common";
import { AllServices } from "./types";

export type ServiceContext = Omit<MyGQLContext, "services" | "setCacheControl">;

export interface ServiceInit {
  context: ServiceContext;
  services: AllServices;
  cache: boolean;
}

export class BaseService {
  public context: ServiceContext;
  public services: AllServices;
  constructor({ context, services }: ServiceInit) {
    this.context = context;
    this.services = services;
  }
}
