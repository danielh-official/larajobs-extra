import type { RequestEvent } from '@sveltejs/kit';
import { parseRssContent } from '$lib';

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_REQUESTS = 30; // max requests per IP per window

type RateLimitEntry = {
	count: number;
	resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientKey(request: Request): string {
	const forwardedFor = request.headers.get('x-forwarded-for');
	if (forwardedFor) {
		// take the first IP in the list
		return forwardedFor.split(',')[0]?.trim() || 'unknown';
	}

	const realIp = request.headers.get('x-real-ip');
	if (realIp) return realIp;

	// fall back to user agent to avoid collapsing everything to a single key
	return request.headers.get('user-agent') || 'unknown';
}

function checkRateLimit(request: Request): { limited: boolean; retryAfter?: number; remaining?: number } {
	const now = Date.now();
	const key = getClientKey(request);
	const entry = rateLimitStore.get(key);

	if (!entry || now > entry.resetAt) {
		// start a new window
		rateLimitStore.set(key, {
			count: 1,
			resetAt: now + RATE_LIMIT_WINDOW_MS
		});

		return { limited: false, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
	}

	if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
		return {
			limited: true,
			retryAfter: Math.max(1, Math.floor((entry.resetAt - now) / 1000)),
			remaining: 0
		};
	}

	entry.count += 1;
	rateLimitStore.set(key, entry);

	return {
		limited: false,
		remaining: RATE_LIMIT_MAX_REQUESTS - entry.count
	};
}

export async function GET(event: RequestEvent) {
	const rate = checkRateLimit(event.request);

	if (rate.limited) {
		return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
			status: 429,
			headers: {
				'Content-Type': 'application/json',
				'Retry-After': String(rate.retryAfter ?? 60),
				'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
				'X-RateLimit-Remaining': '0'
			}
		});
	}

	const upstream = await event.fetch('https://larajobs.com/feed');

	if (!upstream.ok) {
		throw new Error(`Failed to fetch LaraJobs feed: ${upstream.statusText}`);
	}

	const content = await upstream.text();
	const body = JSON.stringify(parseRssContent(content));

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			// Encourage Vercel/other CDNs to cache responses and serve from edge
			'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
			'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
			'X-RateLimit-Remaining': String(rate.remaining ?? RATE_LIMIT_MAX_REQUESTS)
		}
	});
}
