import { test, expect } from "@playwright/test";

const REQRES_API_KEY = process.env.REQRES_API_KEY ?? "free_user_3DRT9cADdk4RUCr2uXGijL1lyJ9";

const reqresHeaders = {
  "x-api-key": REQRES_API_KEY,
};

test.describe("API Response Snapshot Tests", () => {
  test("snapshot single user response structure @regression", async ({ request }) => {
    // Fetch a specific user
    const response = await request.get("https://reqres.in/api/users/2", {
      headers: reqresHeaders,
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const userData = body.data;

    // Snapshot the user data (these fields are static for user ID 2 on reqres.in)
    const snapshotData = {
      id: userData.id,
      email: userData.email,
      first_name: userData.first_name,
      last_name: userData.last_name,
    };

    expect(JSON.stringify(snapshotData, null, 2)).toMatchSnapshot("single-user-data.txt");
  });

  test("snapshot user list response keys @regression", async ({ request }) => {
    // Fetch user list
    const response = await request.get("https://reqres.in/api/users?page=1", {
      headers: reqresHeaders,
    });
    expect(response.status()).toBe(200);

    const body = await response.json();

    // Snapshot the top-level response keys (structure check)
    // This catches if the API adds or removes fields from the response
    const topLevelKeys = Object.keys(body).sort();
    expect(JSON.stringify(topLevelKeys, null, 2)).toMatchSnapshot("user-list-response-keys.txt");

    // Snapshot the keys of the first user object (field structure check)
    const userKeys = Object.keys(body.data[0]).sort();
    expect(JSON.stringify(userKeys, null, 2)).toMatchSnapshot("user-object-keys.txt");
  });

  test("snapshot POST response with dynamic fields removed @regression", async ({ request }) => {
    // Create a user via POST
    const createResponse = await request.post("https://reqres.in/api/users", {
      headers: reqresHeaders,
      data: {
        name: "Kunal Deore",
        job: "QA Automation Engineer",
      },
    });

    expect(createResponse.status()).toBe(201);

    const createBody = await createResponse.json();

    // Remove dynamic fields (id and createdAt change every time)
    const cleanedResponse = {
      name: createBody.name,
      job: createBody.job,
    };

    // Snapshot only the static parts
    expect(JSON.stringify(cleanedResponse, null, 2)).toMatchSnapshot("post-user-cleaned.txt");
  });

  test("snapshot pagination metadata @regression", async ({ request }) => {
    // Fetch user list page 1
    const response = await request.get("https://reqres.in/api/users?page=1", {
      headers: reqresHeaders,
    });
    expect(response.status()).toBe(200);

    const body = await response.json();

    // Snapshot pagination info (page, per_page, total, total_pages)
    const paginationData = {
      page: body.page,
      per_page: body.per_page,
      total: body.total,
      total_pages: body.total_pages,
    };

    expect(JSON.stringify(paginationData, null, 2)).toMatchSnapshot("pagination-metadata.txt");
  });
});
