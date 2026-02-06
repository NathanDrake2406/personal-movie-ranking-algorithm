/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { SearchCombobox } from "./SearchCombobox";

// Mock CSS modules
vi.mock("./page.module.css", () => ({
  default: new Proxy({}, { get: (_, prop) => prop }),
}));

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

const mockFetch = vi.fn();
global.fetch = mockFetch;

const searchResults = {
  results: [
    {
      id: 1,
      title: "Inception",
      year: "2010",
      poster: "https://example.com/inception.jpg",
    },
    { id: 2, title: "Interstellar", year: "2014", poster: null },
  ],
};

function mockSearchResponse(results = searchResults) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(results),
  });
}

describe("SearchCombobox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders input with correct ARIA attributes", () => {
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("placeholder", "Search for a film…");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
  });

  it("typing triggers debounced search after 200ms", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "In");

    // fetch should NOT be called immediately
    expect(mockFetch).not.toHaveBeenCalled();

    mockSearchResponse();

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/search?q=In",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it("does not search for queries shorter than 2 chars", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "A");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows dropdown with suggestions on API response", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockSearchResponse();
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "Incep");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
      expect(screen.getByText("Interstellar")).toBeInTheDocument();
    });
  });

  it('shows "No results found" for empty results', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockSearchResponse({ results: [] });
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "zzzzz");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });

  it("clicking suggestion calls onSelect with tmdbId", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSelect = vi.fn();
    mockSearchResponse();
    render(<SearchCombobox onSelect={onSelect} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "Incep");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Inception"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("ArrowDown highlights first item", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockSearchResponse();
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "In");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    await user.keyboard("{ArrowDown}");

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("Enter selects highlighted item", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSelect = vi.fn();
    mockSearchResponse();
    render(<SearchCombobox onSelect={onSelect} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "In");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("Escape closes dropdown", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockSearchResponse();
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "In");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Clear button clears input and hides dropdown", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockSearchResponse();
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "Incep");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    const clearBtn = screen.getByLabelText("Clear search");
    await user.click(clearBtn);

    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows spinner while search is loading", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Return a promise that never resolves to keep loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "In");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // The spinner should be visible
    const spinner = document.querySelector(".inputSpinner");
    expect(spinner).toBeInTheDocument();
  });

  it("input shows selected movie title after selection", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockSearchResponse();
    render(<SearchCombobox onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "In");

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(screen.getByText("Inception")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Inception"));

    expect(input).toHaveValue("Inception");
  });
});
