const nock = require( 'nock' );
const tempFiles = require( './temp-files' );

const owner = 'test_owner';
const repo = 'test_repo';
const pullNumber = 123;
const commitId = '3da541559918a808c2402bba5012f6c60b27661c';
const token = 'xyz123';

const githubActionsBot = 'github-actions[bot]';
const githubEndpoint = 'https://api.github.com';
const nockOptions = Object.freeze( { allowUnmocked: false } );

beforeAll( async () => {

	const eventPath = await tempFiles.jsonFile( {
		pull_request: {
			number: pullNumber
		}
	} );

	Object.assign( process.env, {
		GITHUB_EVENT_PATH: eventPath,
		GITHUB_REPOSITORY: `${owner}/${repo}`,
		GITHUB_SHA: commitId,
	} );
} );

beforeEach( () => {

	nock( githubEndpoint, nockOptions )
		.get( '/_nock' )
		.reply( 200, 'OK!' );
} );

afterEach( () => {
	nock.cleanAll();
} );

afterAll( async () => {
	await tempFiles.clean();
} );

function setupInputs( comparisonPath, environments ) {

	Object.assign( process.env, {

		'INPUT_COMPARISON-PATH': comparisonPath,
		INPUT_ENVIRONMENTS: environments,
		'INPUT_GITHUB-TOKEN': token,
	} );
}

async function runAction() {

	// @actions/github parses process.env so this needs to be done late
	const action = require( '..' );
	await action();
}

test( 'no chnages', async () => {

	const comparisonPath = await tempFiles.jsonFile( {
		flags: {}
	} );

	setupInputs( comparisonPath, 'test' );

	let approveBody = null;
	const approveRequest = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.post( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, body => {
			approveBody = body;
			return true;
		} )
		.reply( 200, {
			id: 80,
			user: { login: githubActionsBot }
		} );

	await expect( runAction() ).resolves.toEqual( undefined );

	approveRequest.done();

	expect( approveBody ).toEqual( {
		commit_id: commitId,
		event: 'APPROVE',
	} );
} );

test( 'non environmental chnages', async () => {

	const comparisonPath = await tempFiles.jsonFile( {
		flags: {
			foo: {
				change: 'update',
				environments: {
					test: { change: 'none' },
					prod: { change: 'none' }
				}
			}
		}
	} );

	setupInputs( comparisonPath, 'test' );

	let approveBody = null;
	const approveRequest = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.post( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, body => {
			approveBody = body;
			return true;
		} )
		.reply( 200, {
			id: 90,
			user: { login: githubActionsBot }
		} );

	await expect( runAction() ).resolves.toEqual( undefined );

	approveRequest.done();

	expect( approveBody ).toEqual( {
		commit_id: commitId,
		event: 'APPROVE',
	} );
} );

test( 'approved environmental chnage', async () => {

	const comparisonPath = await tempFiles.jsonFile( {
		flags: {
			foo: {
				change: 'update',
				environments: {
					test: { change: 'update' },
					prod: { change: 'none' }
				}
			}
		}
	} );

	setupInputs( comparisonPath, 'test' );

	let approveBody = null;
	const approveRequest = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.post( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, body => {
			approveBody = body;
			return true;
		} )
		.reply( 200, {
			id: 90,
			user: { login: githubActionsBot }
		} );

	await expect( runAction() ).resolves.toEqual( undefined );

	approveRequest.done();

	expect( approveBody ).toEqual( {
		commit_id: commitId,
		event: 'APPROVE',
	} );
} );
