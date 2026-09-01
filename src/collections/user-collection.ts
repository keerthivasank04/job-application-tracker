import type { Contract } from "../prisma/contract.d";

export class UserCollection extends Collection<Contract, "User"> {
  byEmail(email: string) {
    return this.where({ email }).first();
  }
}
