import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await page
    .getByLabel("Username", { exact: true })
    .fill(process.env.LOGIN_USERNAME ?? "askprofnui");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.LOGIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Step inside" }).click();
  await expect(page.getByRole("heading", { name: "Big ideas." })).toBeVisible();
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if ((page.viewportSize()?.width ?? 1440) <= 720) {
    await expect(menu).toBeVisible();
    await menu.click();
  }
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
}
function reply(text: string) {
  const parts = [
    { type: "start", messageId: "test-answer" },
    {
      type: "data-sources",
      data: [
        {
          source: "D02_assignments.txt",
          section: "ASSIGNMENT 1",
          text: "Choose one country other than Qatar. Use at least three scholarly case studies.",
        },
      ],
    },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
    { type: "finish" },
  ];
  return (
    parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}
test("sign-in, responsive welcome, keyboard and profile", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Send question" }),
  ).toBeDisabled();
  await page.screenshot({
    path: `/private/tmp/askprofnui-home-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) {
    await menu.click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await menu.click();
  }
  await page.getByRole("button", { name: /Your space/ }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Test Student");
  await page.getByLabel("Major", { exact: true }).fill("Information Systems");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Profile saved" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("heading", { name: /Hi Test/ })).toBeVisible();
  expect(errors).toEqual([]);
});
test("browse and read actual course materials, then prepare a question", async ({
  page,
}, info) => {
  await signIn(page);
  await page.getByRole("button", { name: "Explore your course", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Class updates", exact: true })).toBeVisible();
  await page.screenshot({
    path: `/private/tmp/nui-library-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Class updates", exact: true }).click();
  await expect(page.getByRole("button", { name: /Assignments & assessment/ })).toHaveCount(0);
  await page.getByRole("button", { name: /September 16 class update/ }).click();
  const update = page.getByRole("dialog");
  await expect(update).toContainText("September 28");
  await expect(update).toContainText("AI-CLONE OFFICE HOURS");
  await expect(update).not.toContainText("OPTIONAL IX LAB OPPORTUNITIES");
  await expect(update).not.toContainText("computer vision");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "All materials", exact: true }).click();
  await expect(page.locator(".library-view .material-card")).toHaveCount(11);
  await expect(page.locator(".library-view .class-update-card")).toHaveCount(1);
  await page.getByLabel("Search course materials").fill("adoption");
  await expect(
    page.getByRole("button", { name: /Technology adoption/ }),
  ).toBeVisible();
  await page.getByLabel("Search course materials").fill("zzzz-no-material");
  await expect(
    page.getByRole("heading", { name: "No matching materials" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: /Assignments & assessment/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog
      .getByText("ASSIGNMENT 1: CULTURAL FRAMEWORK ASSIGNMENT (20%)", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(dialog).toContainText("Qatar");
  await dialog
    .getByRole("button", { name: "Explore this with Prof Nui" })
    .click();
  await expect(page.getByLabel("Your question for Prof Nui")).toHaveValue(
    /Assignment 1/,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("chat, safe rich text, sources, tab continuity and reset", async ({
  page,
}) => {
  await signIn(page);
  let count = 0;
  await page.route("**/api/chat", (route) => {
    count++;
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "x-vercel-ai-ui-message-stream": "v1" },
      body: reply(
        "Choose a country **other than Qatar**.\n\n1. Pick a framework.\n2. Find three scholarly case studies.\n\n<script>alert('unsafe')</script>",
      ),
    });
  });
  await page
    .getByLabel("Your question for Prof Nui")
    .fill("Can I choose Qatar for Assignment 1?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("log")).toContainText("other than Qatar");
  await expect(page.getByRole("log").locator("ol li")).toHaveCount(2);
  await expect(page.getByRole("log").locator("script")).toHaveCount(0);
  await page.getByRole("button", { name: /Sources/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Assignments & assessment",
  );
  await page.getByRole("dialog").locator("summary").first().click();
  await expect(page.getByRole("dialog")).toContainText(
    "three scholarly case studies",
  );
  await page.keyboard.press("Escape");
  await navigate(page, "Course library");
  await navigate(page, "Ask Nui 2.0");
  await expect(page.getByRole("log")).toContainText("other than Qatar");
  const menu = page.getByRole("button", { name: "Open navigation" });
  if ((page.viewportSize()?.width ?? 1440) <= 720) {
    await expect(menu).toBeVisible();
    await menu.click();
  }
  await page.getByRole("button", { name: /New conversation/ }).click();
  await expect(page.getByRole("heading", { name: "Big ideas." })).toBeVisible();
  expect(count).toBe(1);
});
test("failed reply can be retried; voice view has clear controls", async ({
  page,
}) => {
  await signIn(page);
  let count = 0;
  await page.route("**/api/chat", (route) => {
    count++;
    return route.fulfill(
      count === 1
        ? { status: 503, body: "Unavailable" }
        : {
            status: 200,
            contentType: "text/event-stream",
            headers: { "x-vercel-ai-ui-message-stream": "v1" },
            body: reply("TAM focuses on perceived usefulness and ease of use."),
          },
    );
  });
  await page.getByLabel("Your question for Prof Nui").fill("Explain TAM");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".error-note")).toContainText("couldn't finish");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("perceived usefulness");
  await page.route("**/api/voices", (route) =>
    route.fulfill({ json: { voices: [], defaultVoiceId: "" } }),
  );
  await navigate(page, "Live conversation");
  await expect(
    page.getByRole("button", { name: "Start a conversation", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Leaving this view ends/)).toBeVisible();
});
