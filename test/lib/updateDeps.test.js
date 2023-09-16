import { beforeAll, beforeEach, jest } from "@jest/globals";
jest.unstable_mockModule("../../lib/git.js", () => ({
	getTags: jest.fn(),
}));
let resolveReleaseType,
	resolveNextVersion,
	getNextVersion,
	getNextPreVersion,
	getPreReleaseTag,
	getVersionFromTag,
	getTags;

beforeAll(async () => {
	({ getTags } = await import("../../lib/git.js"));
	({
		resolveReleaseType,
		resolveNextVersion,
		getNextVersion,
		getNextPreVersion,
		getPreReleaseTag,
		getVersionFromTag,
	} = await import("../../lib/updateDeps.js"));
});

describe("resolveNextVersion()", () => {
	// prettier-ignore
	const cases = [
		["1.0.0", "1.0.1", undefined, "1.0.1"],
		["1.0.0", "1.0.1", "override", "1.0.1"],

		["*", "1.3.0", "satisfy", "*"],
		["^1.0.0", "1.0.1", "satisfy", "^1.0.0"],
		["^1.2.0", "1.3.0", "satisfy", "^1.2.0"],
		["1.2.x", "1.2.2", "satisfy", "1.2.x"],

		["~1.0.0", "1.1.0", "inherit", "~1.1.0"],
		["1.2.x", "1.2.1", "inherit", "1.2.x"],
		["1.2.x", "1.3.0", "inherit", "1.3.x"],
		["^1.0.0", "2.0.0", "inherit", "^2.0.0"],
		["*", "2.0.0", "inherit", "*"],
		["~1.0", "2.0.0", "inherit", "~2.0"],
		["~2.0", "2.1.0", "inherit", "~2.1"],
	]

	cases.forEach(([currentVersion, nextVersion, strategy, resolvedVersion]) => {
		it(`${currentVersion}/${nextVersion}/${strategy} gives ${resolvedVersion}`, () => {
			expect(resolveNextVersion(currentVersion, nextVersion, strategy)).toBe(resolvedVersion);
		});
	});
});

describe("resolveReleaseType()", () => {
	// prettier-ignore
	const cases = [
		[
			"returns own package's _nextType if exists",
			{
				_nextType: "patch",
				localDeps: [],
			},
			undefined,
			undefined,
			"patch",
		],
		[
			"implements `inherit` strategy: returns the highest release type of any deps",
			{
				manifest: { dependencies: { a: "1.0.0" } },
				_nextType: undefined,
				localDeps: [
					{
						name: "a",
						manifest: { dependencies: { b: "1.0.0", c: "1.0.0", d: "1.0.0" } },
						_lastRelease: { version: "1.0.0" },
						_nextType: false,
						localDeps: [
							{ name: "b", _nextType: false, localDeps: [], _lastRelease: { version: "1.0.0" }  },
							{ name: "c", _nextType: "patch", localDeps: [], _lastRelease: { version: "1.0.0" }  },
							{ name: "d", _nextType: "major", localDeps: [], _lastRelease: { version: "1.0.0" }  },
						],
					},
				],
			},
			undefined,
			"inherit",
			"major"
		],
		[
			"overrides dependent release type with custom value if defined",
			{
				manifest: { dependencies: { a: "1.0.0" } },
				_nextType: undefined,
				localDeps: [
					{
						name: "a",
						// _lastRelease: { version: "1.0.0" },
						manifest: { dependencies: { b: "1.0.0", c: "1.0.0", d: "1.0.0" } },
						_nextType: false,
						localDeps: [
							{ name: "b", _nextType: false, localDeps: [], _lastRelease: { version: "1.0.0" }  },
							{ name: "c", _nextType: "minor", localDeps: [], _lastRelease: { version: "1.0.0" }  },
							{ name: "d", _nextType: "patch", localDeps: [], _lastRelease: { version: "1.0.0" }  },
						],
					},
				],
			},
			undefined,
			"major",
			"major"
		],
		[
			"uses `patch` strategy as default (legacy flow)",
			{
				manifest: { dependencies: { a: "1.0.0" } },
				_nextType: undefined,
				localDeps: [
					{
						name: "a",
						_nextType: false,
						//_lastRelease: { version: "1.0.0" },
						manifest: { dependencies: { b: "1.0.0", c: "1.0.0", d: "1.0.0" } },
						localDeps: [
							{ name: "b", _nextType: false, localDeps: [], _lastRelease: { version: "1.0.0" }  },
							{ name: "c", _nextType: "minor", localDeps: [], _lastRelease: { version: "1.0.0" }  },
							{ name: "d", _nextType: "major", localDeps: [], _lastRelease: { version: "1.0.0" }  },
						],
					},
				],
			},
			undefined,
			undefined,
			"patch"
		],
		[
			"returns undefined if no _nextRelease found",
			{
				_nextType: undefined,
				localDeps: [
					{
						_nextType: false,
						localDeps: [
							{ _nextType: false, localDeps: [] },
							{
								_nextType: undefined,
								localDeps: [
									{ _nextType: undefined, localDeps: [] }
								]
							},
						],
					},
				],
			},
			undefined,
			undefined,
			undefined,
		],
	]

	cases.forEach(([name, pkg, bumpStrategy, releaseStrategy, result]) => {
		it(name, () => {
			expect(resolveReleaseType(pkg, bumpStrategy, releaseStrategy)).toBe(result);
		});
	});
});

it("`override` + `prefix` injects carets to the manifest", () => {
	const pkgB = { name: "b", _nextType: false, localDeps: [], _lastRelease: { version: "1.0.0" } };
	const pkgC = { name: "c", _nextType: "minor", localDeps: [], _lastRelease: { version: "1.0.0" } };
	const pkgD = { name: "d", _nextType: "patch", localDeps: [], _lastRelease: { version: "1.0.0" } };
	const pkgA = {
		name: "a",
		manifest: { dependencies: { b: "1.0.0", c: "1.0.0", d: "1.0.0" } },
		_nextType: false,
		localDeps: [pkgB, pkgC, pkgD],
	};
	const pkg = {
		name: "root",
		manifest: { dependencies: { a: "1.0.0" } },
		_nextType: undefined,
		localDeps: [pkgA],
	};

	const type = resolveReleaseType(pkg, "override", "patch", [], "^");

	expect(type).toBe("patch");
	expect(pkg._nextType).toBe("patch");

	expect(pkg.manifest.dependencies.a).toBe("^1.0.0");
	expect(pkgA.manifest.dependencies.b).toBe("^1.0.0");
	expect(pkgA.manifest.dependencies.c).toBe("^1.1.0");
	expect(pkgA.manifest.dependencies.d).toBe("^1.0.1");
});

describe("getNextVersion()", () => {
	// prettier-ignore
	const cases = [
		[undefined, "patch", "1.0.0"],
		["1.0.0", "patch", "1.0.1"],
		["2.0.0", undefined, "2.0.0"],
		["1.0.0-dev.1", "major", "1.0.0"],
		["1.0.0-dev.1", undefined, "1.0.0-dev.1"],
		["1.0.0-dev.1", "minor", "1.0.0"],
		["1.0.0-dev.1", "patch", "1.0.0"],
	]

	cases.forEach(([lastVersion, releaseType, nextVersion, preRelease]) => {
		it(`${lastVersion} and ${releaseType} gives ${nextVersion}`, () => {
			// prettier-ignore
			expect(getNextVersion({
				_nextType: releaseType,
				_lastRelease: {version: lastVersion},
				_preRelease: preRelease
			})).toBe(nextVersion);
		});
	});
});

describe("getNextPreVersion()", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});
	// prettier-ignore
	const cases = [
		[undefined, "patch", "rc", [], "1.0.0-rc.1"],
		[undefined, "patch", "rc", [], "1.0.0-rc.1"],
		[null, "patch", "rc", [], "1.0.0-rc.1"],
		[null, "patch", "rc", [], "1.0.0-rc.1"],
		["1.0.0-rc.0", "minor", "dev", [], "1.0.0-dev.1"],
		["1.0.0-dev.0", "major", "dev", [], "1.0.0-dev.1"],
		["1.0.0-dev.0", "major", "dev", ["testing-package@1.0.0-dev.1"], "1.0.0-dev.2"],
		["1.0.0-dev.0", "major", "dev", ["testing-package@1.0.0-dev.1", "1.0.1-dev.0"], "1.0.1-dev.1"],
		["11.0.0", "major", "beta", [], "12.0.0-beta.1"],
		["1.0.0", "minor", "beta", [], "1.1.0-beta.1"],
		["1.0.0", "patch", "beta", [], "1.0.1-beta.1"],
	]

	cases.forEach(([lastVersion, releaseType, preRelease, lastTags, nextVersion]) => {
		it(`${lastVersion} and ${releaseType} ${
			lastTags.length ? "with existent tags " : ""
		}gives ${nextVersion}`, () => {
			// prettier-ignore
			expect(getNextPreVersion(
				{
					_nextType: releaseType,
					_lastRelease: {version: lastVersion},
					_preRelease: preRelease,
					_branch: "master",
					name: "testing-package"
				},
				{
					tags: lastTags,
				}
			)).toBe(nextVersion);
		});
		it(`${lastVersion} and ${releaseType} ${
			lastTags.length ? "with looked up branch tags " : ""
		}gives ${nextVersion}`, () => {
			getTags.mockImplementation(() => {
				return lastTags;
			});
			// prettier-ignore
			expect(getNextPreVersion(
				{
					_nextType: releaseType,
					_lastRelease: {version: lastVersion},
					_preRelease: preRelease,
					_branch: "master",
					name: "testing-package"
				},
				{
					useGitTags: true,
				}
			)).toBe(nextVersion);
			expect(getTags).toHaveBeenCalledTimes(1);
		});
	});
	it("does not allow tags and useGitTags", () => {
		expect(() =>
			getNextPreVersion(
				{
					_nextType: "patch",
					_lastRelease: { version: "1.0.0" },
					_preRelease: "dev",
					_branch: "master",
					name: "testing-package",
				},
				{
					useGitTags: true,
					tags: [],
				}
			)
		).toThrowError("You can only separately provide a set of tags or specify useGitTags!");
	});
	// Simulates us not using tags as criteria

	const noTagCases = [
		// prerelease channels just bump up the pre-release
		["1.0.0-rc.0", "minor", "rc", "1.0.0-rc.1"],
		["1.0.0-dev.0", "major", "dev", "1.0.0-dev.1"],
		["1.0.0-dev.0", "major", "dev", "1.0.0-dev.1"],
		["1.0.1-dev.0", "major", "dev", "1.0.1-dev.1"],
		// main channels obey the release type
		["11.0.0", "major", "beta", "12.0.0-beta.1"],
		["1.0.0", "minor", "beta", "1.1.0-beta.1"],
		["1.0.0", "patch", "beta", "1.0.1-beta.1"],
	];
	noTagCases.forEach(([lastVersion, releaseType, preRelease, nextVersion]) => {
		it(`${lastVersion} and ${releaseType} for channel ${preRelease} gives ${nextVersion}`, () => {
			// prettier-ignore
			expect(getNextPreVersion(
				{
					_nextType: releaseType,
					_lastRelease: {version: lastVersion},
					_preRelease: preRelease,
					_branch: "master",
					name: "testing-package"
				},
			)).toBe(nextVersion);
		});
	});
});

describe("getPreReleaseTag()", () => {
	// prettier-ignore
	const cases = [
		[undefined, null],
		[null, null],
		["1.0.0-rc.0", "rc"],
		["1.0.0-dev.0", "dev"],
		["1.0.0-dev.2", "dev"],
		["1.1.0-beta.0", "beta"],
		["11.0.0", null],
		["11.1.0", null],
		["11.0.1", null],
	]

	cases.forEach(([version, preReleaseTag]) => {
		it(`${version} gives ${preReleaseTag}`, () => {
			// prettier-ignore
			expect(getPreReleaseTag(version)).toBe(preReleaseTag);
		});
	});
});

describe("getVersionFromTag()", () => {
	// prettier-ignore
	const cases = [
		[{}, undefined, null],
		[{ name: undefined }, undefined, null],
		[{}, null, null],
		[{ name: null }, null, null],
		[{ name: undefined }, '1.0.0', '1.0.0'],
		[{ name: null }, '1.0.0', '1.0.0'],
		[{ name: 'abc' }, undefined, null],
		[{ name: 'abc' }, null, null],
		[{ name: 'abc' }, '1.0.0', '1.0.0'],
		[{ name: 'dev' }, '1.0.0-dev.1', '1.0.0-dev.1'],
		[{ name: 'app' }, 'app@1.0.0-dev.1', '1.0.0-dev.1'],
		[{ name: 'app' }, 'app@1.0.0-devapp@.1', null],
		[{ name: 'msr-test-a' }, 'msr-test-a@1.0.0-rc.1', '1.0.0-rc.1'],
		[{ name: 'msr.test.a' }, 'msr.test.a@1.0.0', '1.0.0'],
		[{ name: 'msr_test_a' }, 'msr_test_a@1.0.0', '1.0.0'],
		[{ name: 'msr@test@a' }, 'msr@test@a@1.0.0', '1.0.0'],
		[{ name: 'abc' }, 'a.b.c-rc.0', null],
		[{ name: 'abc' }, '1-rc.0', null],
		[{ name: 'abc' }, '1.0.x-rc.0', null],
		[{ name: 'abc' }, '1.x.0-rc.0', null],
		[{ name: 'abc' }, 'x.1.0-rc.0', null],
	]

	cases.forEach(([pkg, tag, versionFromTag]) => {
		it(`${JSON.stringify(pkg)} pkg with tag ${tag} gives ${versionFromTag}`, () => {
			// prettier-ignore
			expect(getVersionFromTag(pkg, tag)).toBe(versionFromTag);
		});
	});
});
