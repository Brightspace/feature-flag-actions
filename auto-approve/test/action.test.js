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
	const action = require( '../src' );
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

test( 'non-approved chnage - no previous approval', async () => {

	const comparisonPath = await tempFiles.jsonFile( {
		flags: {
			foo: {
				change: 'update',
				environments: {
					test: { change: 'none' },
					prod: { change: 'update' }
				}
			}
		}
	} );

	setupInputs( comparisonPath, 'test' );

	const listRequest = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.get( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews` )
		.reply( 200, [] );

	await expect( runAction() ).resolves.toEqual( undefined );

	listRequest.done();
} );

test( 'non-approved chnage - unrelated approval', async () => {

	const comparisonPath = await tempFiles.jsonFile( {
		flags: {
			foo: {
				change: 'update',
				environments: {
					test: { change: 'none' },
					prod: { change: 'update' }
				}
			}
		}
	} );

	setupInputs( comparisonPath, 'test' );

	const listRequest = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.get( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews` )
		.reply( 200, [
			{
				id: 75,
				user: { login: 'johndoe' }
			}
		] );

	await expect( runAction() ).resolves.toEqual( undefined );

	listRequest.done();
} );

test( 'non-approved chnage - single previous approval', async () => {

	const comparisonPath = await tempFiles.jsonFile( {
		flags: {
			foo: {
				change: 'update',
				environments: {
					test: { change: 'none' },
					prod: { change: 'update' }
				}
			}
		}
	} );

	setupInputs( comparisonPath, 'test' );

	const listRequest = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.get( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews` )
		.reply( 200, [
			{
				id: 75,
				user: { login: githubActionsBot }
			}
		] );

	let dismissBody = null;
	const dismissRequest = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.put( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/75/dismissals`, body => {
			dismissBody = body;
			return true;
		} )
		.reply( 200 );

	await expect( runAction() ).resolves.toEqual( undefined );

	listRequest.done();
	dismissRequest.done();

	expect( dismissBody ).toEqual( {
		message: 'Approval no longer applicable.'
	} );
} );

test( 'non-approved chnage - multiple previous approvals', async () => {

	const comparisonPath = await tempFiles.jsonFile( {
		flags: {
			foo: {
				change: 'update',
				environments: {
					test: { change: 'none' },
					prod: { change: 'update' }
				}
			}
		}
	} );

	setupInputs( comparisonPath, 'test' );

	const listRequest = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.get( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews` )
		.reply( 200, [
			{
				id: 75,
				user: { login: githubActionsBot }
			},
			{
				id: 85,
				user: { login: githubActionsBot }
			}
		] );

	let dismissBody1 = null;
	const dismissRequest1 = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.put( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/75/dismissals`, body => {
			dismissBody1 = body;
			return true;
		} )
		.reply( 200 );

	let dismissBody2 = null;
	const dismissRequest2 = nock( githubEndpoint, {
			...nockOptions,
			reqheaders: {
				'Authorization': `token ${token}`
			}
		} )
		.put( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/85/dismissals`, body => {
			dismissBody2 = body;
			return true;
		} )
		.reply( 200 );

	await expect( runAction() ).resolves.toEqual( undefined );

	listRequest.done();
	dismissRequest1.done();
	dismissRequest2.done();

	expect( dismissBody1 ).toEqual( {
		message: 'Approval no longer applicable.'
	} );

	expect( dismissBody2 ).toEqual( {
		message: 'Approval no longer applicable.'
	} );
} );

test( 'invalid comparison', async () => {

	const comparisonPath = await tempFiles.jsonFile( {
		junk: true
	} );

	setupInputs( comparisonPath, 'test' );

	await expect( runAction() ).rejects.toThrow( 'validation failed' );
} );
