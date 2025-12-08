<script lang="ts">
	import { db } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import * as chrono from 'chrono-node';
	import { parseRssContent, type LaraJobsFeedXml } from '$lib';

	let content = $state('');
	let parseError: string | null = $state(null);

	let loading = $state(false);

	let showParseRssContent = $state(false);
	let showFetchAndStoreFeedButton = $state(false);

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

		const serverCheckResponse = await fetch('/api/check');

		showFetchAndStoreFeedButton = serverCheckResponse.ok;

		loading = false;
	});

	// MARK: - RSS Parsing and Database Writing

	function parseRssContentFromInput() {
		parseError = null;

		try {
			writeToIndexedDB(parseRssContent(content));
		} catch (error) {
			console.error('Error parsing RSS feed:', error);
			parseError = 'Failed to parse RSS feed. Please check the content and try again.';
			return;
		}
	}

	function writeToIndexedDB(jsonContent: LaraJobsFeedXml) {
		if (!jsonContent) {
			console.error('No JSON content to write to database.');
			return;
		}

		const items = jsonContent.rss.channel.item;

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
					guid: item.guid._text?.trim(), // Use GUID as the primary key
					name: item.title._text?.trim(),
					company: item['job:company']._cdata?.trim(),
					location: item['job:location']._cdata?.trim(),
					link: item.link._text?.trim(),
					published_date: date?.toISOString(),
					parsed_published_date: date,
					creator: item['dc:creator']._cdata?.trim(),
					category: item.category._cdata?.trim(),
					job_type: item['job:job_type']._cdata?.trim(),
					salary: item['job:salary']._cdata?.trim(),
					company_logo: item['job:company_logo']._text?.trim(),
					tags: item['job:tags']._cdata?.split(',')?.map((tag) => tag?.trim())
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

	let location = $state<string>(page.url.searchParams.get('location') || '');

	let queryParamLocation = $derived.by(() => {
		return page.url.searchParams.get('location') || '';
	});

	let type = $state<string>(page.url.searchParams.get('type') || '');

	let queryParamType = $derived.by(() => {
		return page.url.searchParams.get('type') || '';
	});

	let salary = $state<string>(page.url.searchParams.get('salary') || '');

	let queryParamSalary = $derived.by(() => {
		return page.url.searchParams.get('salary') || '';
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

	let publishedStartDate = $state<string>(page.url.searchParams.get('published_start_date') || '');

	let parsedPublishedStartDate = $derived.by(() => {
		if (publishedStartDate.trim() === '') {
			return null;
		}
		const parsedDate = chrono.parseDate(publishedStartDate);
		return parsedDate;
	});

	let queryParamPublishedStartDate = $derived.by(() => {
		return page.url.searchParams.get('published_start_date') || '';
	});

	let parsedQueryParamPublishedStartDate = $derived.by(() => {
		const publishedDateParam = page.url.searchParams.get('published_start_date') || '';
		if (publishedDateParam.trim() === '') {
			return null;
		}
		const parsedDate = chrono.parseDate(publishedDateParam);
		return parsedDate;
	});

	let publishedEndDate = $state<string>(page.url.searchParams.get('published_end_date') || '');

	let parsedPublishedEndDate = $derived.by(() => {
		if (publishedEndDate.trim() === '') {
			return null;
		}
		const parsedDate = chrono.parseDate(publishedEndDate);
		return parsedDate;
	});

	let queryParamPublishedEndDate = $derived.by(() => {
		return page.url.searchParams.get('published_end_date') || '';
	});

	let parsedQueryParamPublishedEndDate = $derived.by(() => {
		const publishedDateParam = page.url.searchParams.get('published_end_date') || '';
		if (publishedDateParam.trim() === '') {
			return null;
		}
		const parsedDate = chrono.parseDate(publishedDateParam);
		return parsedDate;
	});

	function applyFilters() {
		const url = new URL(page.url);
		company && url.searchParams.set('company', company);
		location && url.searchParams.set('location', location);
		type && url.searchParams.set('type', type);
		salary && url.searchParams.set('salary', salary);
		tags && url.searchParams.set('tags', tags);
		publishedStartDate && url.searchParams.set('published_start_date', publishedStartDate);
		publishedEndDate && url.searchParams.set('published_end_date', publishedEndDate);

		if (!company) {
			url.searchParams.delete('company');
		}

		if (!tags) {
			url.searchParams.delete('tags');
		}

		if (!location) {
			url.searchParams.delete('location');
		}

		if (!type) {
			url.searchParams.delete('type');
		}

		if (!salary) {
			url.searchParams.delete('salary');
		}

		if (!publishedStartDate) {
			url.searchParams.delete('published_start_date');
		}

		if (!publishedEndDate) {
			url.searchParams.delete('published_end_date');
		}

		goto(url.toString(), { keepFocus: true });
	}

	function clearFilters() {
		company = '';
		location = '';
		type = '';
		salary = '';
		tags = '';
		publishedStartDate = '';
		publishedEndDate = '';
		applyFilters();
	}

	// MARK: - Postings List

	const postings = $derived.by(() => {
		queryParamCompany;
		queryParamLocation;
		queryParamType;
		queryParamTags;
		queryParamPublishedStartDate;
		queryParamPublishedEndDate;
		queryParamSalary;

		return liveQuery(async () => {
			let collection = db.postings.toCollection();

			if (queryParamCompany.trim() !== '') {
				collection = collection.filter((posting) =>
					posting.company.toLowerCase().includes(company.trim().toLowerCase())
				);
			}

			if (queryParamLocation.trim() !== '') {
				collection = collection.filter((posting) =>
					posting.location.toLowerCase().includes(location.trim().toLowerCase())
				);
			}

			if (queryParamType.trim() !== '') {
				collection = collection.filter((posting) =>
					posting.job_type.toLowerCase().includes(type.trim().toLowerCase())
				);
			}

			if (queryParamSalary.trim() !== '') {
				if (salary.trim().toLowerCase() === 'none') {
					collection = collection.filter((posting) => !posting.salary.trim());
				} else if (salary.trim().toLowerCase() === 'exists') {
					collection = collection.filter((posting) => !!posting.salary.trim());
				} else {
					collection = collection.filter((posting) =>
						posting.salary?.toLowerCase().includes(salary.trim()?.toLowerCase())
					);
				}
			}

			if (parsedTags?.length > 0) {
				if (parsedTags?.length === 1 && parsedTags[0] === 'none') {
					collection = collection.filter((posting) => {
						return (
							posting.tags?.length === 0 || (posting.tags?.length === 1 && posting.tags[0] === '')
						);
					});
				} else {
					collection = collection.filter((posting) => {
						const postingTags = posting.tags?.map((tag) => tag.toLowerCase()) || [];
						return parsedTags.every((tag) => postingTags.includes(tag));
					});
				}
			}

			if (queryParamPublishedStartDate.trim() !== '') {
				const filterDate = parsedQueryParamPublishedStartDate;
				if (filterDate) {
					collection = collection.filter((posting) => {
						if (!posting.parsed_published_date) return false;
						const postingDate = new Date(posting.parsed_published_date);
						return postingDate >= filterDate;
					});
				}
			}

			if (queryParamPublishedEndDate.trim() !== '') {
				const filterDate = parsedQueryParamPublishedEndDate;
				if (filterDate) {
					collection = collection.filter((posting) => {
						if (!posting.parsed_published_date) return false;
						const postingDate = new Date(posting.parsed_published_date);
						return postingDate <= filterDate;
					});
				}
			}

			return await collection.sortBy('parsed_published_date').then((results) => results.reverse());
		});
	});

	async function fetchAndStoreFeed() {
		const response = await fetch('/api/larajobs/feed');

		if (response.ok) {
			writeToIndexedDB(await response.json());
		} else {
			console.error('Failed to fetch LaraJobs feed:', response.statusText);
		}
	}
</script>

<svelte:head>
	<title>LaraJobs Extra</title>
	<meta
		name="description"
		content="An enhanced job listing platform for LaraJobs with extra filtering capabilities."
	/>
</svelte:head>

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
			{#if showFetchAndStoreFeedButton}
				<button
					class="px-4 py-2 rounded-lg border-2 text-white hover:bg-white cursor-pointer bg-red-500 border-red-500 hover:text-red-500"
					onclick={fetchAndStoreFeed}
				>
					Fetch and Store Feed
				</button>
			{/if}
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
					class="bg-gray-100 dark:bg-gray-700 md:w-1/2 w-full"
					bind:value={content}
					rows="4"
					placeholder="Paste RSS feed content here"
				></textarea>
			</div>
			<div>
				<button
					class="px-6 py-4 rounded-lg border-2 text-white hover:bg-white bg-red-500 cursor-pointer border-red-500 hover:text-red-500"
					onclick={parseRssContentFromInput}
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
			<div class="md:flex justify-between items-center mb-4">
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
						onclick={clearFilters}
					>
						Clear Filters
					</button>
				</div>
			</div>

			<div class="flex flex-col gap-y-4">
				<!-- MARK: - Company Filter -->

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

				<!-- MARK: - Location Filter -->

				<div>
					<label class="block mb-2 font-semibold" for="location">Location</label>
					<input
						type="text"
						id="location"
						name="location"
						placeholder="Enter location to filter by"
						class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
						bind:value={location}
						onkeydown={(e) => e.key === 'Enter' && applyFilters()}
					/>
				</div>

				<!-- MARK: - Type Filter -->

				<div>
					<label class="block mb-2 font-semibold" for="type">Type</label>
					<input
						type="text"
						id="type"
						name="type"
						placeholder="Enter job type to filter by"
						class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
						bind:value={type}
						onkeydown={(e) => e.key === 'Enter' && applyFilters()}
					/>
				</div>

				<!-- MARK: - Salary Filter -->

				<div>
					<label class="block mb-2 font-semibold" for="salary">Salary</label>
					<input
						type="text"
						id="salary"
						name="salary"
						placeholder="Enter salary to filter by."
						class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
						bind:value={salary}
						onkeydown={(e) => e.key === 'Enter' && applyFilters()}
					/>
					<div>
						<small class="text-gray-500"
							>* To filter postings with no salary specified, enter 'none'. To filter postings with
							any salary specified, enter 'exists'.</small
						>
					</div>
				</div>

				<!-- MARK: - Tags Filter -->

				<div>
					<label class="block mb-2 font-semibold" for="tags">Tags</label>
					<input
						type="text"
						id="tags"
						name="tags"
						placeholder="Enter tags to filter by (comma-separated)."
						class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
						bind:value={tags}
						onkeydown={(e) => e.key === 'Enter' && applyFilters()}
					/>
					<div>
						<small class="text-gray-500"
							>* To filter postings with no tags specified, enter 'none'. For multiple tags,
							separate them with commas (e.g., "remote,full-time").</small
						>
					</div>
				</div>

				<!-- MARK: - Published Date Filter -->

				<div class="font-semibold">Published Date</div>

				<small class="text-gray-500"
					>* You can enter dates in various formats, e.g., "2023-01-01", "January 1, 2023", "1st Jan
					2023", or even "7 days ago".</small
				>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 ml-4">
					<div>
						<label class="block mb-2 font-semibold" for="published-start-date">From</label>
						<input
							type="text"
							class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
							id="published-start-date"
							name="published-start-date"
							bind:value={publishedStartDate}
							onkeydown={(e) => e.key === 'Enter' && applyFilters()}
							placeholder="e.g., 2023-01-01 or January 1, 2023"
						/>
						<div>
							{#if parsedPublishedStartDate}
								<small class="text-green-500"
									>Preview:
									{parsedPublishedStartDate.toLocaleDateString() +
										' ' +
										parsedPublishedStartDate.toLocaleTimeString()}</small
								>
							{:else if publishedStartDate.trim() !== ''}
								<small class="text-red-500">Could not parse start date.</small>
							{/if}
						</div>
					</div>
					<div>
						<label class="block mb-2 font-semibold" for="published-end-date">To</label>
						<input
							type="text"
							class="ml-2 p-2 border rounded w-full dark:bg-gray-700 dark:text-white"
							id="published-end-date"
							name="published-end-date"
							bind:value={publishedEndDate}
							onkeydown={(e) => e.key === 'Enter' && applyFilters()}
							placeholder="e.g., 2023-01-01 or January 1, 2023"
						/>
						<div>
							{#if parsedPublishedEndDate}
								<small class="text-green-500"
									>Preview:
									{parsedPublishedEndDate.toLocaleDateString() +
										' ' +
										parsedPublishedEndDate.toLocaleTimeString()}</small
								>
							{:else if publishedEndDate.trim() !== ''}
								<small class="text-red-500">Could not parse end date.</small>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- MARK: - List -->
	<div class="my-6">
		<h1 class="text-2xl font-bold text-center mb-4">Job Postings</h1>
	</div>

	<div class="text-center mb-4">
		Total: {$postings ? $postings?.length : 0} job posting{$postings && $postings?.length !== 1
			? 's'
			: ''}
	</div>

	<div>
		{#if $postings && $postings?.length === 0}
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
								class="mb-2"
								width="120px"
								height="120px"
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
						{#if posting?.tags?.length > 0 && posting?.tags[0]}
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
