type AdminGraphql = {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export async function fetchOrderTags(admin: AdminGraphql, orderGid: string): Promise<string[]> {
  const res = await admin.graphql(
    `#graphql
    query OrderTags($id: ID!) {
      order(id: $id) {
        tags
      }
    }`,
    { variables: { id: orderGid } },
  );
  const j = await res.json();
  const tags = j?.data?.order?.tags;
  return Array.isArray(tags) ? tags : [];
}

export async function addOrderTagsIfMissing(
  admin: AdminGraphql,
  orderGid: string,
  tagsToAdd: string[],
): Promise<void> {
  const existing = new Set(
    (await fetchOrderTags(admin, orderGid)).map((t) => t.toLowerCase()),
  );
  const filtered = tagsToAdd.filter((t) => !existing.has(t.toLowerCase()));
  if (filtered.length === 0) return;

  const res = await admin.graphql(
    `#graphql
    mutation TagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    { variables: { id: orderGid, tags: filtered } },
  );
  const j = await res.json();
  const errs = j?.data?.tagsAdd?.userErrors;
  if (errs?.length) {
    console.error("tagsAdd userErrors", errs);
  }
}
