// Stub mínimo do xlsx para o ambiente de testes.
// vi.mock('xlsx', ...) nos arquivos de teste sobrescreve este stub.
export const read = () => ({ SheetNames: [], Sheets: {} });
export const utils = {
  sheet_to_json: () => [],
  encode_cell: () => '',
  decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }),
};
export const writeFile = () => {};
export const write = () => new Uint8Array();
