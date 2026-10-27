import { test, expect, type Page } from "@playwright/test";

const profile = {
  name: "Test Student",
  major: "Information Systems",
  year: "Junior",
};

async function openLive(page: Page) {
  await page.addInitScript((saved) => {
    localStorage.setItem("askprofnui.profile", JSON.stringify(saved));
  }, profile);
  await page.route("**/api/voices", (route) =>
    route.fulfill({
      json: {
        voices: [
          { id: "nui-en", name: "Nui" },
          { id: "other-en", name: "Alternative English" },
        ],
        defaultVoiceId: "nui-en",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Username", { exact: true })
    .fill(process.env.LOGIN_USERNAME ?? "askprofnui");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.LOGIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Step inside" }).click();
  await expect(page.getByRole("heading", { name: /Hi Test/ })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) <= 720) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: /^Live conversation/ })
    .click();
  await expect(
    page.getByRole("radio", { name: "English", exact: true }),
  ).toBeChecked();
}

test("chooses language before starting, keeps English voice and saved profile, scopes Arabic RTL", async ({
  page,
}, info) => {
  const requests: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/live-session", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { languages: { en: true, ar: true } } });
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      status: 503,
      json: { error: "Mock session unavailable" },
    });
  });
  await openLive(page);
  const englishStart = page.getByRole("button", {
    name: "Start a conversation",
    exact: true,
  });
  await expect(englishStart).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Voice", exact: true })
    .selectOption("other-en");
  expect(requests).toEqual([]);
  await page.getByRole("radio", { name: "English", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "العربية الفصحى", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".live-conversation")).toHaveAttribute(
    "dir",
    "rtl",
  );
  await expect(page.locator(".live-conversation")).toHaveAttribute(
    "lang",
    "ar",
  );
  await expect(page.locator("html")).not.toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("combobox", { name: "Voice", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("الصوت: نُوي · العربية الفصحى")).toBeVisible();
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `/private/tmp/nui-live-ar-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "ابدأ المحادثة", exact: true })
    .click();
  await expect(
    page.locator(".live-conversation").getByRole("alert"),
  ).toContainText("تعذر بدء المحادثة بالعربية");
  expect(requests).toEqual([{ profile, language: "ar" }]);
  await page.getByRole("radio", { name: "English", exact: true }).check();
  await expect(
    page.getByRole("combobox", { name: "Voice", exact: true }),
  ).toHaveValue("other-en");
  await expect(
    page.locator(".live-conversation").getByRole("alert"),
  ).toHaveCount(0);
  await englishStart.click();
  await expect(
    page.locator(".live-conversation").getByRole("alert"),
  ).toContainText("Mock session unavailable");
  expect(requests[1]).toEqual({ profile, language: "en", voiceId: "other-en" });
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("askprofnui.profile")!),
    ),
  ).toEqual(profile);
  expect(errors).toEqual([]);
});

test("unconfigured Arabic stays unavailable without silently starting English", async ({
  page,
}) => {
  const posts: unknown[] = [];
  await page.route("**/api/live-session", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { languages: { en: true, ar: false } } });
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Unexpected start" } });
  });
  await openLive(page);
  await page
    .getByRole("radio", { name: "العربية الفصحى", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "ابدأ المحادثة", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText(
    "المحادثة بالعربية غير متاحة حاليًا",
  );
  await page.getByRole("radio", { name: "English", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Start a conversation", exact: true }),
  ).toBeEnabled();
  expect(posts).toEqual([]);
});

test("availability failure offers retry and never auto-starts a call", async ({
  page,
}) => {
  let checks = 0;
  let posts = 0;
  let failAvailability = true;
  await page.route("**/api/live-session", (route) => {
    if (route.request().method() !== "GET") {
      posts += 1;
      return route.fulfill({
        status: 503,
        json: { error: "Unexpected start" },
      });
    }
    checks += 1;
    return failAvailability
      ? route.fulfill({ status: 503, body: "Unavailable" })
      : route.fulfill({ json: { languages: { en: true, ar: true } } });
  });
  await openLive(page);
  await expect(
    page.locator(".live-conversation").getByRole("alert"),
  ).toContainText("couldn't check");
  await expect(
    page.getByRole("button", { name: "Start a conversation", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("radio", { name: "العربية الفصحى", exact: true })
    .check();
  const checksBeforeRetry = checks;
  failAvailability = false;
  await page
    .getByRole("button", { name: "تحقق مرة أخرى", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "ابدأ المحادثة", exact: true }),
  ).toBeEnabled();
  expect(checks).toBeGreaterThan(checksBeforeRetry);
  expect(posts).toBe(0);
});

test("rejects a mismatched response language before loading the live SDK", async ({
  page,
}) => {
  await page.route("**/api/live-session", (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? { languages: { en: true, ar: true } }
          : {
              language: "en",
              sessionToken: "never-use-this-test-token",
              openingMessage: "Hello",
            },
    }),
  );
  await openLive(page);
  await page
    .getByRole("radio", { name: "العربية الفصحى", exact: true })
    .check();
  await page
    .getByRole("button", { name: "ابدأ المحادثة", exact: true })
    .click();
  await expect(
    page.locator(".live-conversation").getByRole("alert"),
  ).toContainText("تعذر بدء المحادثة بالعربية");
  await expect(page.locator("video")).toHaveCount(0);
});
