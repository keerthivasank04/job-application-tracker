import type { Contract } from "../prisma/contract.d";

export class ApplicationCollection extends Collection<Contract, "Application"> {
  forUser(userId: number) {
    return this.where({ userId });
  }

  newestFirst() {
    return this.orderBy((app) => app.appliedDate.desc());
  }

  byId(id: number) {
    return this.where({ id }).first();
  }
}
