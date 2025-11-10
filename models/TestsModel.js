import prisma from "../config/prisma.js";


export const getAllCourses = async () => {
    const courses = await prisma.course.findMany({
        orderBy: { id: "asc" },
    });
    return courses;
};


export const createCourse = async ({ title, description, category, teacher }) => {
    const course = await prisma.course.create({
        data: {
            title,
            description,
            category,
            teacher,
        },
    });
    return course;
};
