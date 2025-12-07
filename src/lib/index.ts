// place files you want to import through the `$lib` alias in this folder.

import convert from 'xml-js';

export interface LaraJobsFeedXml {
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

export function parseRssContent(content: string) {
	const rssJson = convert.xml2js(content, { compact: true }) as {
		rss: { channel: { item: Array<any> } };
	};

	return rssJson as LaraJobsFeedXml;
}
