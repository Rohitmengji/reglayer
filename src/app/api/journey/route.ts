/**
 * POST /api/journey — Execute a user journey flow scan
 * GET  /api/journey — List preset journeys
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { executeJourney, type JourneyConfig } from "@/lib/scanner/journey/flow-scanner";

// ─── Preset Journeys ────────────────────────────────────

const PRESET_JOURNEYS: Record<string, Omit<JourneyConfig, "baseUrl">> = {
  "ecommerce-checkout": {
    name: "E-Commerce Checkout Flow",
    description: "Tests the typical shopping experience: browse → product → cart → checkout",
    steps: [
      {
        name: "Landing page load",
        action: { type: "navigate", url: "/" },
        assertions: [
          { type: "landmark" },
          { type: "heading" },
          { type: "focus", expected: undefined },
        ],
      },
      {
        name: "Search for a product",
        action: { type: "click", selector: "[type='search'], input[name='search'], [role='searchbox']" },
        assertions: [{ type: "focus", expected: "input" }],
      },
      {
        name: "Type search query",
        action: { type: "type", selector: "[type='search'], input[name='search'], [role='searchbox']", text: "shirt" },
      },
      {
        name: "Submit search",
        action: { type: "press", key: "Enter" },
        assertions: [{ type: "liveRegion" }],
        waitFor: "[role='list'], .product-list, .search-results",
      },
      {
        name: "Click first product",
        action: { type: "click", selector: ".product-card a, .search-results a, [role='list'] a" },
        assertions: [{ type: "heading" }, { type: "title" }],
      },
      {
        name: "Add to cart",
        action: { type: "click", selector: "button:has-text('Add to Cart'), [data-action='add-to-cart'], .add-to-cart" },
        assertions: [{ type: "liveRegion", expected: "cart" }],
      },
      {
        name: "Open cart",
        action: { type: "click", selector: "[href*='cart'], [aria-label*='cart'], .cart-icon" },
        assertions: [{ type: "heading", expected: "Cart" }],
      },
      {
        name: "Proceed to checkout",
        action: { type: "click", selector: "a:has-text('Checkout'), button:has-text('Checkout'), [href*='checkout']" },
        assertions: [{ type: "heading" }, { type: "landmark" }],
      },
    ],
  },

  "login-flow": {
    name: "Authentication Flow",
    description: "Tests login, error handling, and successful authentication",
    steps: [
      {
        name: "Navigate to login",
        action: { type: "navigate", url: "/login" },
        assertions: [{ type: "heading" }, { type: "landmark" }],
      },
      {
        name: "Focus email field",
        action: { type: "click", selector: "input[type='email'], input[name='email'], #email" },
        assertions: [{ type: "focus", expected: "input" }],
      },
      {
        name: "Enter invalid email",
        action: { type: "type", selector: "input[type='email'], input[name='email'], #email", text: "invalid" },
      },
      {
        name: "Tab to password field",
        action: { type: "press", key: "Tab" },
        assertions: [{ type: "focus", expected: "input" }],
      },
      {
        name: "Submit empty form",
        action: { type: "press", key: "Enter" },
        assertions: [{ type: "liveRegion" }],
      },
    ],
  },

  "form-wizard": {
    name: "Multi-Step Form Wizard",
    description: "Tests multi-step form with validation, progress indication, and error recovery",
    steps: [
      {
        name: "Navigate to form",
        action: { type: "navigate", url: "/signup" },
        assertions: [{ type: "heading" }, { type: "landmark" }],
      },
      {
        name: "Fill first field",
        action: { type: "click", selector: "input:first-of-type, [name='name'], #name" },
        assertions: [{ type: "focus", expected: "input" }],
      },
      {
        name: "Type name",
        action: { type: "type", selector: "input:first-of-type, [name='name'], #name", text: "Test User" },
      },
      {
        name: "Tab through fields",
        action: { type: "press", key: "Tab" },
        assertions: [{ type: "focus" }],
      },
      {
        name: "Submit step",
        action: { type: "click", selector: "button[type='submit'], button:has-text('Next'), .next-btn" },
        assertions: [{ type: "liveRegion" }, { type: "focus" }],
      },
    ],
  },
};

// ─── GET: List available journeys ────────────────────────

export async function GET() {
  const journeys = Object.entries(PRESET_JOURNEYS).map(([id, j]) => ({
    id,
    name: j.name,
    description: j.description,
    stepCount: j.steps.length,
  }));

  return NextResponse.json({ journeys });
}

// ─── POST: Execute a journey ─────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Plan check — Pro or Enterprise
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });

  if (!member || !["pro", "enterprise"].includes(member.workspace.plan || "")) {
    return NextResponse.json(
      { error: "Journey scanning requires a Pro or Enterprise plan" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { presetId, journey: customJourney, baseUrl } = body as {
    presetId?: string;
    journey?: JourneyConfig;
    baseUrl?: string;
  };

  if (!presetId && !customJourney) {
    return NextResponse.json(
      { error: "Provide presetId or custom journey config" },
      { status: 400 }
    );
  }

  // Build config
  let config: JourneyConfig;

  if (presetId) {
    const preset = PRESET_JOURNEYS[presetId];
    if (!preset) {
      return NextResponse.json(
        { error: `Unknown preset: ${presetId}. Available: ${Object.keys(PRESET_JOURNEYS).join(", ")}` },
        { status: 400 }
      );
    }
    if (!baseUrl) {
      return NextResponse.json(
        { error: "baseUrl is required when using a preset journey" },
        { status: 400 }
      );
    }
    config = { ...preset, baseUrl };
  } else {
    config = customJourney!;
    // Validate custom journey
    if (!config.name || !config.steps || config.steps.length === 0) {
      return NextResponse.json(
        { error: "Custom journey must have name and at least one step" },
        { status: 400 }
      );
    }
    if (config.steps.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 steps per journey" },
        { status: 400 }
      );
    }
  }

  try {
    const result = await executeJourney(config);

    return NextResponse.json({
      success: true,
      result,
      recommendations: generateRecommendations(result),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Journey execution failed: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}

// ─── Recommendations ─────────────────────────────────────

function generateRecommendations(result: Awaited<ReturnType<typeof executeJourney>>): string[] {
  const recs: string[] = [];

  if (result.summary.focusIssues > 0) {
    recs.push(
      `${result.summary.focusIssues} step(s) have focus management issues. After navigation or state changes, programmatically move focus to the new content (e.g., heading or first interactive element). Use document.getElementById('target').focus() or React refs.`
    );
  }

  if (result.summary.keyboardTraps > 0) {
    recs.push(
      `${result.summary.keyboardTraps} keyboard trap(s) detected. Ensure modal dialogs have focusable elements and focus cycles within them. Pressing Escape should close dialogs and return focus to the trigger.`
    );
  }

  if (result.summary.liveRegionIssues > 0) {
    recs.push(
      `${result.summary.liveRegionIssues} missing or incorrect live region announcement(s). Use aria-live="polite" for status updates and aria-live="assertive" for errors. The region must exist in the DOM before content is injected.`
    );
  }

  if (result.summary.missingAnnouncements > 0) {
    recs.push(
      `${result.summary.missingAnnouncements} state change(s) without screen reader announcements. Add aria-live regions or use role="status"/role="alert" for dynamic content updates.`
    );
  }

  if (result.overallScore < 70) {
    recs.push(
      "Overall journey accessibility score is below 70. Consider auditing your page transition patterns, ensuring each navigation target manages focus appropriately."
    );
  }

  if (recs.length === 0) {
    recs.push("Journey flow scanning found no critical accessibility issues. Consider testing with additional user journeys for broader coverage.");
  }

  return recs;
}
