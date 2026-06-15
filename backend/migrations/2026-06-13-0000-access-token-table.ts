import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable("access_token", (table) => {
        table.increments("id");
        table.integer("user_id").unsigned().notNullable()
            .references("id").inTable("user").onDelete("CASCADE");
        table.string("name", 255);
        table.string("token", 255).notNullable().unique();
        table.datetime("created_date");
        table.datetime("last_used_date").nullable();
        table.boolean("active").notNullable().defaultTo(true);
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable("access_token");
}
