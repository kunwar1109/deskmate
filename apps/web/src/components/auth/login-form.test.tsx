import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jsonResponse, mockFetch } from "@/test/utils";

// The form calls useRouter() from Next. Outside a running Next app there is no router, so give it a fake one.
const router = { replace: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => router }));

// Imported only after the mock is registered. A normal import would run first and load the real router.
let LoginForm: typeof import("@/components/auth/login-form").LoginForm;

describe("LoginForm", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeAll(async () => {
    ({ LoginForm } = await import("@/components/auth/login-form"));
  });

  beforeEach(() => {
    fetchMock = mockFetch();
    router.replace.mockClear();
    router.refresh.mockClear();
  });

  it("shows the shared schema's messages and sends nothing when the form is invalid", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs in and goes to the dashboard", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { user: {}, workspace: {} }));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "  Owner@BrewBox.in ");
    await user.type(screen.getByLabelText("Password"), "a-long-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    // The request resolves asynchronously, so wait for the redirect instead of checking right away.
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/login");
    // The schema trims and lowercases the email before it's sent, same as the API does.
    expect(JSON.parse(init!.body as string)).toEqual({ email: "owner@brewbox.in", password: "a-long-password" });
  });

  it("shows one message for a wrong password, without saying which field was wrong", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Invalid credentials" }));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "owner@brewbox.in");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("says when the API can't be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "owner@brewbox.in");
    await user.type(screen.getByLabelText("Password"), "a-long-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Couldn't reach the server. Is the API running?")).toBeInTheDocument();
  });
});
