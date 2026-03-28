interface Env {
  R2: R2Bucket;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const filename = context.params.filename as string;
  const object = await context.env.R2.get(filename);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
};
