import { customType } from "drizzle-orm/pg-core";

// Postgres bytea <-> Node Buffer. COA files and catalog images are small (a few
// hundred KB) and low-volume, so storing bytes in the DB avoids standing up
// object storage. Kept in its own module because both the batch and product
// schemas need it and they already reference each other.
export const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});
