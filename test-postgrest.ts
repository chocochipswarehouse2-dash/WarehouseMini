export function buildFuzzySearchQuery(keyword: string, columns: string[]): string {
  const tokens = keyword.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  
  if (tokens.length === 1) {
    const term = encodeURIComponent(tokens[0]);
    return `or=(${columns.map(c => `${c}.ilike.*${term}*`).join(',')})`;
  }
  
  // Multiple tokens -> AND( OR(col1=token1, col2=token1), OR(col1=token2, col2=token2) )
  // Wait, in querystring it is `and=(or(col1.ilike.*A*,col2.ilike.*A*),or(col1.ilike.*B*,col2.ilike.*B*))`
  const andParts = tokens.map(token => {
    const term = encodeURIComponent(token);
    return `or(${columns.map(c => `${c}.ilike.*${term}*`).join(',')})`;
  });
  
  return `and=(${andParts.join(',')})`;
}
console.log(buildFuzzySearchQuery("glenda cream", ["sku", "nama_produk"]))
