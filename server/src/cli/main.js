#!/usr/bin/env node

import "dotenv/config";
import chalk from "chalk";
import figlet from "figlet";
import { Command } from "commander";
import { login,logout,whoami } from "./commands/auth/login.js";
import { wakeUp } from "../cli/commands/ai/wakeUp.js";

const main = async () => {
    console.log(
        chalk.cyanBright(
            figlet.textSync("FLUX CLI",{
                font:"Standard",
                horizontalLayout:"default"
            })
        )
    );
    console.log(chalk.gray("A Cli based AI tool \n"));
    const program = new Command("flux");

    program.version("0.0.1").description("Flux Cli: Device FLow Auth");

  
    program.addCommand(wakeUp);
    program.addCommand(login);
    program.addCommand(logout);
    program.addCommand(whoami);


    program.action(() => {
        program.help
    });

    program.parse();
}

main().catch((error) => {
  console.error(chalk.red("Error running Orbit CLI:"), error);
  process.exit(1);
});