import { test, expect } from "@playwright/test";
import { PracticePage } from "../pages/PracticePage.js";

const REQRES_API_KEY = process.env.REQRES_API_KEY ?? "free_user_3DRT9cADdk4RUCr2uXGijL1lyJ9";

const reqresHeaders = {
  "x-api-key": REQRES_API_KEY,
};

test.describe("API + UI Hybrid Tests", () => {
  test("Pattern 1: Fetch user from API, fill UI form with that data @smoke", async ({
    page,
    request,
  }) => {
    // ---------
    // STEP 1: API — Fetch a user from reqres.in
    // ---------
    const apiResponse = await request.get("https://reqres.in/api/users/1", {
      headers: reqresHeaders,
    });

    // Assert the API call was successful
    expect(apiResponse.status()).toBe(200);
    expect(apiResponse.ok()).toBeTruthy();

    // Parse the response body
    const responseBody = await apiResponse.json();
    const apiUser = responseBody.data;

    // Log what we got from the API
    console.log("API returned user:", apiUser);
    console.log("Name:", apiUser.first_name, apiUser.last_name);
    console.log("Email:", apiUser.email);

    // ---------
    // STEP 2: UI — Use the API data to fill the practice form
    // ---------
    const practicePage = new PracticePage(page);
    await practicePage.goto();

    // Use the API user's name and email in the form
    const fullName = `${apiUser.first_name} ${apiUser.last_name}`;

    await practicePage.fillForm({
      name: fullName,
      email: apiUser.email,
      password: "ApiTest123!",
      gender: "Male",
      dob: "1990-05-15",
      loveIceCream: true,
      employment: "employed",
    });

    // Verify the form was filled with API data
    await expect(practicePage.nameInput).toHaveValue(fullName);
    await expect(practicePage.emailInput).toHaveValue(apiUser.email);

    // Submit and verify success
    await practicePage.submit();
    await expect(practicePage.successAlert).toBeVisible();
    await expect(practicePage.successAlert).toContainText("Success");
  });

  test("Pattern 2: Pure API test — verify user list endpoint @regression", async ({ request }) => {
    // ---------
    // This test uses ONLY API (no browser) — notice we only use 'request', not 'page'
    // ---------

    // GET — fetch list of users
    const listResponse = await request.get("https://reqres.in/api/users?page=1", {
      headers: reqresHeaders,
    });
    expect(listResponse.status()).toBe(200);

    const listBody = await listResponse.json();

    // Assert the response has users
    expect(listBody.data.length).toBeGreaterThan(0);
    console.log("Total users on page 1:", listBody.data.length);

    // Assert first user has required fields
    const firstUser = listBody.data[0];
    expect(firstUser).toHaveProperty("id");
    expect(firstUser).toHaveProperty("email");
    expect(firstUser).toHaveProperty("first_name");
    expect(firstUser).toHaveProperty("last_name");

    console.log("First user:", firstUser.first_name, firstUser.last_name);
  });

  test("Pattern 3: POST to API, then verify response @regression", async ({ request }) => {
    // ---------
    // POST — create a new user via API
    // ---------
    const createResponse = await request.post("https://reqres.in/api/users", {
      headers: reqresHeaders,
      data: {
        name: "Kunal Deore",
        job: "QA Automation Engineer",
      },
    });

    // Assert creation was successful (201 = Created)
    expect(createResponse.status()).toBe(201);

    const createBody = await createResponse.json();

    // Assert the response contains what we sent
    expect(createBody.name).toBe("Kunal Deore");
    expect(createBody.job).toBe("QA Automation Engineer");

    // Assert the API assigned an ID and timestamp
    expect(createBody).toHaveProperty("id");
    expect(createBody).toHaveProperty("createdAt");

    console.log("Created user with ID:", createBody.id);
    console.log("Created at:", createBody.createdAt);
  });
});
