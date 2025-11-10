import prisma from "../config/prisma.js";


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


export const getAllContacts = async () => {
    const contacts = await prisma.contact.findMany({
        orderBy: { created_at: "desc" },
    });
    return contacts;
};
