import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async (_args: LoaderFunctionArgs) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response("ok\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("unavailable\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
};
