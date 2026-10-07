import {
  deleteBilingualProject,
  readBilingualProject,
  writeBilingualProject,
} from "../services/bilingualDbService";

export const bilingualRepository = {
  load: readBilingualProject,
  save: writeBilingualProject,
  clear: deleteBilingualProject,
};
