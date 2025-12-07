import { parseRssContent } from '$lib';

export async function GET() {
	const response = await fetch('https://larajobs.com/feed');

	if (!response.ok) {
		throw new Error(`Failed to fetch LaraJobs feed: ${response.statusText}`);
	}

	const content = await response.text();

	return new Response(JSON.stringify(parseRssContent(content)), {
		status: 200,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}
