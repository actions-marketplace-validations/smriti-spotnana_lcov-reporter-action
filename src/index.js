import { sep, join, resolve } from "path"
import { promises as fs } from "fs"
import core from "@actions/core"
import { GitHub, context } from "@actions/github"

import { parse } from "./lcov"
import { diff } from "./comment"

async function main() {
	const token = core.getInput("github-token")
	let workingDirectory = core.getInput("working-directory", { required: false })
	let cwd = workingDirectory ? resolve(workingDirectory) : "src/react"
	// : process.cwd()
	// const cwd = process.env.BRANCH
	// console.log vs console.debug
	console.debug(cwd, "working-directory ...")

	const CWD = cwd + sep

	// bcoz lcov file parse and tabulating is failing ..
	const lcovFiles = core
		.getInput("reports-array")
		.split(" ")
		.filter(x => x !== "")

	// we shud not need to get from user
	const baseFiles = core
		.getInput("base-reports-array")
		.split(" ")
		.filter(x => x !== "")

	console.debug(lcovFiles, baseFiles, "lcov files and base files")
	// let reports: string[] = core.getInput("reports-array")

	// reports = ["jest.common.json", "jest.web.json", "jest.pixel.json"]

	// console.debug(reports, "reports ...")
	for (let i in lcovFiles) {
		const lcovFile = lcovFiles[i]
		const baseFile = baseFiles[i]
		console.debug(lcovFile, "lcovFile ...")
		console.debug(baseFile, "baseFile ...")

		const file0 = join(CWD, lcovFile)
		const file1 = join(CWD, baseFile)
		console.log(file0, "file0")

		const raw = await fs.readFile(file0, "utf-8").catch(err => null)
		if (!raw) {
			console.log(`No coverage report found at '${file0}', exiting...`)
			return
		}

		const baseRaw =
			baseFile && (await fs.readFile(file1, "utf-8").catch(err => null))
		if (baseFile && !baseRaw) {
			console.log(`No coverage report found at '${file1}', ignoring...`)
		}

		const options = {
			repository: context.payload.repository.full_name,
			prefix: `${process.env.GITHUB_WORKSPACE}/`,
		}

		if (context.eventName === "pull_request") {
			options.commit = context.payload.pull_request.head.sha
			options.head = context.payload.pull_request.head.ref
			options.base = context.payload.pull_request.base.ref
		} else if (context.eventName === "push") {
			options.commit = context.payload.after
			options.head = context.ref
		}

		const lcov = await parse(raw)
		const baselcov = baseRaw && (await parse(baseRaw))
		const body = diff(lcov, baselcov, options)

		if (context.eventName === "pull_request") {
			await new GitHub(token).issues.createComment({
				repo: context.repo.repo,
				owner: context.repo.owner,
				issue_number: context.payload.pull_request.number,
				body: diff(lcov, baselcov, options),
			})
		} else if (context.eventName === "push") {
			await new GitHub(token).repos.createCommitComment({
				repo: context.repo.repo,
				owner: context.repo.owner,
				commit_sha: options.commit,
				body: diff(lcov, baselcov, options),
			})
		}
	}
}

main().catch(function(err) {
	console.log(err)
	core.setFailed(err.message)
})
