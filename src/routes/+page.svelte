<script lang="ts">
	import { db } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { onMount } from 'svelte';
	import convert from 'xml-js';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let content = $state('');
	let jsonContent: LaraJobsFeedXml | null = $state(null);
	let parseError: string | null = $state(null);

	let loading = $state(false);

	let showParseRssContent = $state(false);

	function setShowParseRssContent(value: boolean) {
		showParseRssContent = value;
		localStorage.setItem('showParseRssContent', value.toString());
	}

	let showFilters = $state(false);

	function setShowFilters(value: boolean) {
		showFilters = value;
		localStorage.setItem('showFilters', value.toString());
	}

	// MARK: - onMount

	onMount(async () => {
		loading = true;

		if (browser) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			showParseRssContent = localStorage.getItem('showParseRssContent') === 'true' ? true : false;
			showFilters = localStorage.getItem('showFilters') === 'true' ? true : false;
		}

		loading = false;
	});

	// MARK: - RSS Parsing and Database Writing

	interface LaraJobsFeedXml {
		rss: {
			channel: {
				atomLink: {
					_attributes: {
						href: string;
						rel: string;
						type: string;
					};
				};
				description: {
					_text: string;
				};
				generator: {
					_text: string;
				};
				language: {
					_text: string;
				};
				lastBuildDate: {
					_text: string;
				};
				link: {
					_text: string;
				};
				'sy:updateFrequency': {
					_text: string;
				};
				'sy:updatePeriod': {
					_text: string;
				};
				title: {
					_text: string;
				};
				item: {
					category: {
						_cdata: string;
					};
					'content:encoded': {
						_cdata: string;
					};
					'dc:creator': {
						_cdata: string;
					};
					description: {
						_cdata: string;
					};
					company: {
						_cdata: string;
					};
					company_logo: {
						_cdata: string;
					};
					guid: {
						attributes: {
							isPermaLink: string;
						};
						_text: string;
					};
					'job:company': {
						_cdata: string;
					};
					'job:company_logo': {
						_text: string;
					};
					'job:job_type': {
						_cdata: string;
					};
					'job:location': {
						_cdata: string;
					};
					'job:salary': {
						_cdata: string;
					};
					'job:tags': {
						_cdata: string;
					};
					link: {
						_text: string;
					};
					pubDate: {
						_text: string;
					};
					title: {
						_text: string;
					};
				}[];
			};
		};
	}

	function parseRssContent() {
		parseError = null;

		try {
			const rssJson = convert.xml2js(content, { compact: true }) as {
				rss: { channel: { item: Array<any> } };
			};

			jsonContent = rssJson as LaraJobsFeedXml;

			writeToDatabase(jsonContent);
		} catch (error) {
			console.error('Error parsing RSS feed:', error);
			parseError = 'Failed to parse RSS feed. Please check the content and try again.';
			return;
		}
	}

	function writeToDatabase(jsonContent: LaraJobsFeedXml) {
		if (!jsonContent) {
			console.error('No JSON content to write to database.');
			return;
		}

		const items = jsonContent.rss.channel.item;

		console.log(items);

		// Add each item to the database; if an item with the same GUID exists, it will be replaced
		items.forEach(async (item) => {
			const existingPosting = await db.postings
				.filter((posting) => posting.guid === item.guid._text.trim())
				.first();

			if (existingPosting) {
				try {
					await db.postings.filter((posting) => posting.guid === item.guid._text.trim()).delete();
				} catch (error) {
					console.error('Error deleting existing item from database:', error);
				}
			}

			try {
				const date = new Date(item.pubDate._text);

				await db.postings.put({
					guid: item.guid._text.trim(), // Use GUID as the primary key
					name: item.title._text.trim(),
					company: item['job:company']._cdata.trim(),
					location: item['job:location']._cdata.trim(),
					link: item.link._text.trim(),
					published_date: date.toISOString(),
					parsed_published_date: date,
					creator: item['dc:creator']._cdata.trim(),
					category: item.category._cdata.trim(),
					job_type: item['job:job_type']._cdata.trim(),
					salary: item['job:salary']._cdata.trim(),
					company_logo: item['job:company_logo']._text.trim(),
					tags: item['job:tags']._cdata.split(',').map((tag) => tag.trim())
				});
			} catch (error) {
				console.error('Error writing item to database:', error);
			}
		});
	}

	// MARK: - Utility Functions

	function getDateInRelativeFormat(date: Date | null | undefined): string {
		if (!date) return 'Unknown date';

		const now = new Date();
		const diffInSeconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);

		const intervals: { [key: string]: number } = {
			year: 31536000,
			month: 2592000,
			week: 604800,
			day: 86400,
			hour: 3600,
			minute: 60,
			second: 1
		};

		for (const interval in intervals) {
			const intervalSeconds = intervals[interval];
			const count = Math.floor(diffInSeconds / intervalSeconds);

			if (count >= 1) {
				return `${count} ${interval}${count > 1 ? 's' : ''} ago`;
			}
		}

		return 'Just now';
	}

	// MARK: - Filters

	let company = $state<string>(page.url.searchParams.get('company') || '');

	let queryParamCompany = $derived.by(() => {
		return page.url.searchParams.get('company') || '';
	});

	let tags = $state<string>(page.url.searchParams.get('tags') || '');

	let queryParamTags = $derived.by(() => {
		return page.url.searchParams.get('tags') || '';
	});

	let parsedTags = $derived.by(() => {
		const tagsParam = page.url.searchParams.get('tags') || '';
		return tagsParam
			.split(',')
			.map((tag) => tag.trim().toLowerCase())
			.filter((tag) => tag !== '');
	});

	let publishedDate = $state<string>(page.url.searchParams.get('published_date') || '');

	let queryParamPublishedDate = $derived.by(() => {
		return page.url.searchParams.get('published_date') || '';
	});

	function applyFilters() {
		const url = new URL(page.url);
		company && url.searchParams.set('company', company);
		tags && url.searchParams.set('tags', tags);
		publishedDate && url.searchParams.set('published_date', publishedDate);

		if (!company) {
			url.searchParams.delete('company');
		}

		if (!tags) {
			url.searchParams.delete('tags');
		}

		if (!publishedDate) {
			url.searchParams.delete('published_date');
		}

		goto(url.toString(), { keepFocus: true });
	}

	// MARK: - Postings List

	const postings = $derived.by(() => {
		queryParamCompany;
		queryParamTags;
    queryParamPublishedDate;

		return liveQuery(async () => {
			let collection = db.postings.toCollection();

			if (queryParamCompany.trim() !== '') {
				collection = collection.filter((posting) =>
					posting.company.toLowerCase().includes(company.trim().toLowerCase())
				);
			}

			if (parsedTags.length > 0) {
				if (parsedTags.length === 1 && parsedTags[0] === 'none') {
					collection = collection.filter((posting) => {
						return (
							posting.tags.length === 0 || (posting.tags.length === 1 && posting.tags[0] === '')
						);
					});
				} else {
					collection = collection.filter((posting) => {
						const postingTags = posting.tags.map((tag) => tag.toLowerCase());
						return parsedTags.every((tag) => postingTags.includes(tag));
					});
				}
			}

      if (queryParamPublishedDate.trim() !== '') {
        // Currently, we are only sorting by published date in descending order.
        // Additional filtering logic can be added here if needed in the future.
      }

			return await collection.sortBy('parsed_published_date').then((results) => results.reverse());
		});
	});
</script>

{#if loading}
	<div class="flex justify-center items-center h-screen">
		<div
			class="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-32 w-32"
		></div>
	</div>
{:else}
	<!-- MARK: - Top Items -->
	<div class="flex items-center mt-6 gap-x-4 justify-between max-w-4xl mx-auto">
		<div class="flex gap-x-4">
			<button
				class="px-4 py-2 rounded-lg border-2 text-white hover:bg-white cursor-pointer bg-red-500 border-red-500 hover:text-red-500"
				onclick={() => setShowParseRssContent(!showParseRssContent)}
			>
				{showParseRssContent ? 'Hide RSS Parser' : 'Show RSS Parser'}
			</button>
			<button
				class="px-4 py-2 rounded-lg border-2 text-white hover:bg-white cursor-pointer bg-red-500 border-red-500 hover:text-red-500"
				onclick={() => setShowFilters(!showFilters)}
			>
				{showFilters ? 'Hide Filters' : 'Show Filters'}
			</button>
		</div>
		<div class="flex gap-x-4">
			<a
				href="https://larajobs.com"
				class="hover:underline cursor-pointer"
				target="_blank"
				rel="noopener noreferrer"
			>
				Visit LaraJobs
			</a>
		</div>
	</div>

	<!-- MARK: - RSS Parser -->

	{#if showParseRssContent}
		<div class="max-w-4xl mx-auto my-6 p-4 border rounded shadow">
			<h2 class="text-xl font-bold mb-4">Instructions to Parse RSS Feed</h2>
			<ol class="list-decimal list-inside space-y-2">
				<li>
					Go to <a
						href="https://larajobs.com/feed"
						class="text-blue-500 hover:text-blue-700"
						target="_blank">https://larajobs.com/feed</a
					>
				</li>
				<li>
					Copy all the contents under "This XML file does not appear to have any style information
					associated with it. The document tree is shown below."
				</li>
				<li>Paste the content into the text box below</li>
				<li>Click "Parse RSS Content" to add the job postings</li>
			</ol>
		</div>
		<div class="my-6 text-center flex flex-col gap-y-2">
			<div>
				<textarea
					class="bg-gray-100 dark:bg-gray-700"
					bind:value={content}
					rows="4"
					cols="80"
					placeholder="Paste RSS feed content here"
				></textarea>
			</div>
			<div>
				<button
					class="px-6 py-4 rounded-lg border-2 text-white hover:bg-white bg-red-500 cursor-pointer border-red-500 hover:text-red-500"
					onclick={parseRssContent}
				>
					Parse RSS Content
				</button>
			</div>
			{#if parseError}
				<div class="text-red-500">{parseError}</div>
			{/if}
		</div>
	{/if}

	<!-- MARK: - Filters -->

	{#if showFilters}
		<div class="max-w-4xl mx-auto my-6 p-4 border rounded shadow">
			<div class="flex justify-between items-center mb-4">
				<h2 class="text-xl font-bold mb-4">Filters</h2>
				<div class="mb-4 flex gap-x-4">
					<button
						class="px-4 py-2 rounded-lg border-2 text-white hover:bg-white cursor-pointer bg-red-500 border-red-500 hover:text-red-500"
						onclick={applyFilters}
					>
						Apply Filters
					</button>
					<button
						class="px-4 py-2 rounded-lg border-2 text-white hover:bg-white cursor-pointer bg-gray-500 border-gray-500 hover:text-gray-500"
						onclick={() => {
							company = '';
							tags = '';
							applyFilters();
						}}
					>
						Clear Filters
					</button>
				</div>
			</div>

			<div class="flex flex-col gap-y-4">
				<div>
					<label class="block mb-2 font-semibold" for="company">Company</label>
					<input
						type="text"
						id="company"
						name="company"
						placeholder="Enter company name to filter by"
						class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
						bind:value={company}
						onkeydown={(e) => e.key === 'Enter' && applyFilters()}
					/>
				</div>

				<div>
					<label class="block mb-2 font-semibold" for="tags">Tags</label>
					<input
						type="text"
						id="tags"
						name="tags"
						placeholder="Enter tags to filter by (comma-separated). To filter by no tags, enter 'none'."
						class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
						bind:value={tags}
						onkeydown={(e) => e.key === 'Enter' && applyFilters()}
					/>
				</div>

				<div>
					<label class="block mb-2 font-semibold" for="published-date">Published Date</label>
					<input
						type="text"
						disabled
						class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
						value="Filtered postings are sorted by published date in descending order."
						id="published-date"
						name="published-date"
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- MARK: - List -->
	<div class="my-6">
		<h1 class="text-2xl font-bold text-center mb-4">Job Postings</h1>
	</div>

	<div class="text-center mb-4">
		Total: {$postings ? $postings.length : 0} job posting{$postings && $postings.length !== 1
			? 's'
			: ''}
	</div>

	<div>
		{#if $postings && $postings.length === 0}
			<p class="text-center">
				No job postings available. Please add some using the RSS parser above.
			</p>
		{/if}
	</div>

	<ul class="max-w-4xl mx-auto list-none p-0 dark:bg-gray-800">
		{#if $postings}
			{#each $postings as posting (posting.id)}
				<li class="mb-4 p-4 border rounded shadow flex gap-x-4 items-center">
					<div>
						{#if posting.company_logo !== ''}
							<img
								src={posting.company_logo}
								alt="{posting.company} Logo"
								class="h-16 mb-2"
								width="80px"
								height="100px"
							/>
						{/if}
					</div>
					<div>
						<h2 class="text-xl font-bold">{posting.name} at {posting.company}</h2>
						<p>Location: {posting.location}</p>
						<p>Type: {posting.job_type}</p>
						<p>Salary: {posting.salary === '' ? 'Not specified' : posting.salary}</p>
						<p>Posted: {getDateInRelativeFormat(posting.parsed_published_date)}</p>
						<a href={posting.link} class="text-blue-500 hover:text-blue-700" target="_blank"
							>View Job Posting</a
						>
						{#if posting.tags.length > 0 && posting.tags[0]}
							<div class="mt-2">
								{#each posting.tags as tag}
									<span
										class="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2"
										>#{tag}</span
									>
								{/each}
							</div>
						{/if}
					</div>
				</li>
			{/each}
		{/if}
	</ul>
{/if}
