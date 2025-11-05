import prisma from "../config/prisma.js";

/**
 * 📨 Додати новий контакт
 * @param {Object} data - дані форми контакту
 */
export const addContact = async (data) => {
    const { name, email, phone, telegram, message, agree } = data;

    const contact = await prisma.contact.create({
        data: {
            name,
            email,
            phone,
            telegram,
            message,
            agree: agree ?? false,
            status: "new",
        },
    });

    return contact;
};

/**
 * 📋 Отримати всі контакти (адмін)
 */
export const getAllContacts = async () => {
    const contacts = await prisma.contact.findMany({
        orderBy: { created_at: "desc" },
    });
    return contacts;
};
