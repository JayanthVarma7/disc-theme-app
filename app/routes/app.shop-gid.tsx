import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getShop {
        shop {
          id
        }
      }
    `
  );

  const responseJson = await response.json();
  const shopGid = responseJson.data?.shop?.id;

  return Response.json({ shopGid });
};

