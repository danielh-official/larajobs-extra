<script lang="ts">
	import { db } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { onMount } from 'svelte';
	import convert from 'xml-js';

	let content = $state('');
	let jsonContent: LaraJobsFeedXml | null = $state(null);
	let parseError: string | null = $state(null);

	let showParseRssContent = $state(true);

	function setShowParseRssContent(value: boolean) {
		showParseRssContent = value;
		localStorage.setItem('showParseRssContent', value.toString());
	}

	let showFilters = $state(false);

	function setShowFilters(value: boolean) {
		showFilters = value;
		localStorage.setItem('showFilters', value.toString());
	}

	onMount(() => {
		showParseRssContent = localStorage.getItem('showParseRssContent') === 'true' ? true : false;
		showFilters = localStorage.getItem('showFilters') === 'true' ? true : false;
	});

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

	let company = $state<string>('');

	let tags = $state<string>('');

	let parsedTags = $derived.by(() => {
		return tags
			.split(',')
			.map((tag) => tag.trim().toLowerCase())
			.filter((tag) => tag.length > 0);
	});

	const postings = $derived.by(() => {
		company;
		parsedTags;

		return liveQuery(async () => {
			let collection = db.postings.toCollection();

			if (company.trim() !== '') {
				collection = collection.filter((posting) =>
					posting.company.toLowerCase().includes(company.trim().toLowerCase())
				);
			}

			if (parsedTags.length > 0) {
				collection = collection.filter((posting) => {
					const postingTags = posting.tags.map((tag) => tag.toLowerCase());
					return parsedTags.every((tag) => postingTags.includes(tag));
				});
			}

			return await collection.sortBy('parsed_published_date').then((results) => results.reverse());
		});
	});

	$inspect(postings);

	function deletePosting(id: number) {
		if (!confirm('Are you sure you want to delete this posting?')) {
			return;
		}

		db.postings.delete(id).catch((error) => {
			console.error('Error deleting posting:', error);
		});
	}
</script>

<!-- Top Items -->
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
			<textarea bind:value={content} rows="4" cols="80" placeholder="Paste RSS feed content here"
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
		<h2 class="text-xl font-bold mb-4">Filters</h2>

		<div class="flex flex-col gap-y-4">
			<div>
				<label class="block mb-2 font-semibold" for="company">Company</label>
				<input
					type="text"
					id="company"
					name="company"
					placeholder="Enter company name to filter by"
					class="ml-2 p-2 border rounded w-full"
					bind:value={company}
				/>
			</div>

			<div>
				<label class="block mb-2 font-semibold" for="tags">Tags</label>
				<input
					type="text"
					id="tags"
					name="tags"
					placeholder="Enter tags to filter by (comma-separated)"
					class="ml-2 p-2 border rounded w-full"
					bind:value={tags}
				/>
			</div>
		</div>
	</div>
{/if}

<!-- List -->
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

<ul class="max-w-4xl mx-auto">
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
				<div class="ml-auto">
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button
						class="px-4 py-2 rounded-lg border-2 text-white hover:bg-white cursor-pointer bg-red-500 border-red-500 hover:text-red-500"
						onclick={() => deletePosting(posting.id!)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="size-6"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
							/>
						</svg>
					</button>
				</div>
			</li>
		{/each}
	{/if}
</ul>
