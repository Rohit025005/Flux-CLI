import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { generateText } from 'ai';
import { z } from 'zod';
import yoctoSpinner from "yocto-spinner";

const ApplicationSchema = z.object({
    folderName: z.string().describe('Kebab-case folder name for the application'),
    description: z.string().describe('Brief description of what was created'),
    files: z.array(
        z.object({
            path: z.string().describe('Relative file path (e.g., src/App.jsx)'),
            content: z.string().describe('Complete file content'),
        })
    ).describe('All files needed for the application'),
    setupCommands: z.array(z.string()).describe('Bash commands to setup and run (e.g., npm install, npm run dev)'),
});

function printSystem(message) {
    console.log(message);
}

function displayFileTree(files, folderName) {
    printSystem(chalk.cyan('\n📂 Project Structure:'));
    printSystem(chalk.white(`${folderName}/`));

    const filesByDir = {};
    files.forEach(file => {
        const parts = file.path.split('/');
        const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

        if (!filesByDir[dir]) {
            filesByDir[dir] = [];
        }
        filesByDir[dir].push(parts[parts.length - 1]);
    });

    Object.keys(filesByDir).sort().forEach(dir => {
        if (dir) {
            printSystem(chalk.white(`├── ${dir}/`));
            filesByDir[dir].forEach(file => {
                printSystem(chalk.white(`│   └── ${file}`));
            });
        } else {
            filesByDir[dir].forEach(file => {
                printSystem(chalk.white(`├── ${file}`));
            });
        }
    });
}

async function createApplicationFiles(baseDir, folderName, files) {
    const appDir = path.join(baseDir, folderName);

    await fs.mkdir(appDir, { recursive: true });
    printSystem(chalk.cyan(`\n📁 Created directory: ${folderName}/`));

    for (const file of files) {
        const filePath = path.join(appDir, file.path);
        const fileDir = path.dirname(filePath);

        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf8');
        printSystem(chalk.green(`  ✓ ${file.path}`));
    }

    return appDir;
}

// function extractJSONFromText(text) {
//     if (!text) return null;

//     // Try to find JSON in the text
//     const jsonRegex = /(\{[\s\S]*\}|\[[\s\S]*\])/;
//     const match = text.match(jsonRegex);

//     if (match) {
//         try {
//             const parsed = JSON.parse(match[0]);
//             return parsed;
//         } catch (e) {

//             // if 1st attempt fails. try to clean the json
//             const cleaned = match[0]
//                 .replace(/```json\s*/g, '')  // remove ```json markers
//                 .replace(/```\s*/g, '')      // remove ``` markers
//                 .replace(/^\s*|\s*$/g, '');  // trim whitespace

//             try {
//                 const parsed = JSON.parse(cleaned);
//                 return parsed;
//             } catch (e2) {
//                 console.log(chalk.yellow('  Failed to parse JSON after cleaning'));
//                 return null;
//             }
//         }
//     }

//     return null;
// }



export async function generateApplication(description, aiService, cwd = process.cwd()) {
    try {
        printSystem(chalk.cyan('\n🤖 Agent Mode: Generating your application...\n'));
        printSystem(chalk.gray(`Request: ${description}\n`));

        const FULL_AGENT_PROMPT = `
                    SYSTEM:
                    You are an automated code generation engine.
                    You must return ONLY valid JSON that matches the required schema.
                    Do NOT include explanations, markdown, comments, or extra text.
                    Do NOT wrap output in code blocks.
                    If you cannot satisfy a field, still return valid JSON with best effort.

                    TASK:
                    Generate a complete, working software application for the following request:

                    "${description}"

                    ========================
                    OUTPUT FORMAT RULES
                    ========================

                    Your entire response must be a single JSON object with these fields:
                    - folderName (string, kebab-case)
                    - description (string)
                    - files (array of { path, content })
                    - setupCommands (array of strings)

                    No other fields are allowed.

                    ========================
                    APPLICATION RULES
                    ========================

                    1. The application must run after following setupCommands.
                    2. All files must have FULL, COMPLETE content.
                    3. Include package.json if using Node, React, or any framework.
                    4. Include README.md with:
                    - What the app does
                    - Setup instructions
                    - How to run it
                    5. Include .gitignore when applicable.
                    6. All imports and file paths must be correct.
                    7. No TODOs, placeholders, or missing logic.
                    8. Prefer minimal, simple tech stack unless user explicitly asks otherwise.

                    ========================
                    DEFAULT TECH STACK
                    ========================

                    If not specified by user:
                    - Frontend apps → HTML + CSS + Vanilla JS
                    - Backend APIs → Node.js + Express
                    - Fullstack → Express + simple frontend

                    Avoid React, Vite, Next.js, Docker, or databases unless requested.

                    ========================
                    UI RULES (if frontend)
                    ========================

                    - Clean, readable layout
                    - Responsive if reasonable
                    - Clear labels and buttons
                    - Basic styling included

                    ========================
                    SETUP COMMAND RULES
                    ========================

                    - First command must be: cd <folderName>
                    - Followed by install commands if needed
                    - Final command must start the app (npm run dev, node index.js, or open index.html)

                    ========================
                    FINAL CHECK
                    ========================

                    Before responding, verify:
                    - All files referenced actually exist in files[]
                    - setupCommands will work on a fresh system
                    - JSON is valid and complete

                    Return ONLY the JSON object.
                    `;

        let result;
        let application;
        const MAX_RETRIES = 2;

        // ================= AI GENERATION + RETRY =================
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const aiSpinner = yoctoSpinner({
                text:
                attempt === 1
                    ? "🧠 Generating application..."
                    : `🔁 Retrying generation (${attempt}/${MAX_RETRIES})...`,
            }).start();

            try {
                result = await generateText({
                    model: aiService.model,
                    schema: ApplicationSchema,
                    prompt: FULL_AGENT_PROMPT,
                });

                application = result.object;

                // -------- JSON RECOVERY FALLBACK --------
                if (!application && result.text) {
                    try {
                        const start = result.text.indexOf("{");
                        const end = result.text.lastIndexOf("}");
                        if (start !== -1 && end !== -1) {
                            const json = result.text.slice(start, end + 1);
                            application = ApplicationSchema.parse(JSON.parse(json));
                        }
                    } catch { }
                }

                if (application) {
                    aiSpinner.success("Valid application structure received");
                    break;
                } else {
                    aiSpinner.warning("Invalid format, retrying...");
                }
            } catch (err) {
                aiSpinner.error("AI generation failed");
                throw err;
            }
        }

        if (!application) {
            console.log("\nRAW MODEL OUTPUT:\n", result?.text);
            throw new Error("AI failed to produce valid structured output after retries");
        }

        // ================= VALIDATION =================
        printSystem(chalk.green(`\n📦 Generated: ${application.folderName}\n`));
        printSystem(chalk.gray(`Description: ${application.description}\n`));

        if (!application.files || application.files.length === 0) {
            throw new Error("No files were generated");
        }

        printSystem(chalk.green(`📄 Files: ${application.files.length}\n`));
        displayFileTree(application.files, application.folderName);

        // ================= FILE CREATION =================
        const fileSpinner = yoctoSpinner("📁 Creating project files...").start();
        let appDir;

        try {
            appDir = await createApplicationFiles(cwd, application.folderName, application.files);
            fileSpinner.success("Project files created");
        } catch (err) {
            fileSpinner.error("Failed to create project files");
            throw err;
        }

        // ================= NEXT STEPS =================
        printSystem(chalk.green.bold(`\n✨ Application created successfully!\n`));
        printSystem(chalk.cyan(`📁 Location: ${chalk.bold(appDir)}\n`));

        if (application.setupCommands && application.setupCommands.length > 0) {
            printSystem(chalk.cyan("📋 Next Steps:\n"));
            printSystem(chalk.white("```bash"));
            application.setupCommands.forEach(cmd => printSystem(chalk.white(cmd)));
            printSystem(chalk.white("```\n"));
        } else {
            printSystem(chalk.yellow("ℹ️  No setup commands provided\n"));
        }

        return {
            folderName: application.folderName,
            appDir,
            files: application.files.map(f => f.path),
            commands: application.setupCommands || [],
            success: true,
        };

    } catch (err) {
        printSystem(chalk.red(`\n Error generating application: ${err.message}\n`));
        if (err.stack) printSystem(chalk.dim(err.stack + "\n"));
        throw err;
    }
}
